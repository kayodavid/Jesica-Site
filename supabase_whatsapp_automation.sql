-- Automação oficial de WhatsApp para Jessica Melo Nutricionista
-- Execute este arquivo uma única vez no SQL Editor do projeto Supabase.
-- Ele NÃO envia mensagens e NÃO contém nenhum token da Meta.

create extension if not exists pgcrypto;

create table if not exists public.whatsapp_automation_settings (
  id boolean primary key default true check (id = true),
  enabled boolean not null default false,
  provider_ready boolean not null default false,
  dispatch_timezone text not null default 'America/Sao_Paulo',
  daily_dispatch_time time not null default '09:00:00',
  business_phone_label text not null default '',
  default_template_language text not null default 'pt_BR',
  consent_text text not null default 'Autorizo o recebimento de lembretes administrativos e de acompanhamento pelo WhatsApp da Jessica Melo Nutricionista. Posso solicitar a interrupção dos avisos a qualquer momento.',
  updated_at timestamptz not null default now()
);

insert into public.whatsapp_automation_settings (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.whatsapp_patient_contacts (
  patient_key text primary key,
  patient_name text not null default '',
  phone_e164 text not null default '',
  consent_status text not null default 'pending' check (consent_status in ('pending', 'granted', 'withdrawn')),
  consent_at timestamptz,
  consent_source text not null default '',
  automations_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_service_snapshots (
  source_link_id text primary key,
  patient_key text not null references public.whatsapp_patient_contacts(patient_key) on delete cascade,
  patient_name text not null default '',
  service_id text not null default '',
  service_name text not null default '',
  start_date date not null,
  duration_days integer not null default 0 check (duration_days >= 0),
  service_status text not null default 'active',
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_service_snapshots_due_idx
  on public.whatsapp_service_snapshots (service_status, start_date, duration_days);

create table if not exists public.whatsapp_automation_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  service_id text not null default '',
  service_name text not null default '',
  trigger_type text not null default 'service_ending' check (trigger_type in ('service_ending')),
  offset_days integer not null default 3 check (offset_days between 0 and 365),
  send_time time not null default '09:00:00',
  template_name text not null default '',
  template_language text not null default 'pt_BR',
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_message_log (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid references public.whatsapp_automation_rules(id) on delete set null,
  service_snapshot_id text references public.whatsapp_service_snapshots(source_link_id) on delete set null,
  patient_key text not null,
  patient_name text not null default '',
  recipient_phone text not null default '',
  scheduled_for date not null,
  template_name text not null default '',
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'delivered', 'failed', 'skipped')),
  whatsapp_message_id text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rule_id, service_snapshot_id, scheduled_for)
);

create index if not exists whatsapp_message_log_patient_idx
  on public.whatsapp_message_log (patient_key, created_at desc);
create index if not exists whatsapp_message_log_status_idx
  on public.whatsapp_message_log (status, scheduled_for);

alter table public.whatsapp_automation_settings enable row level security;
alter table public.whatsapp_patient_contacts enable row level security;
alter table public.whatsapp_service_snapshots enable row level security;
alter table public.whatsapp_automation_rules enable row level security;
alter table public.whatsapp_message_log enable row level security;

-- Os dados só são acessados pelo painel administrativo através das funções abaixo
-- ou pelo serviço de envio com a chave segura do servidor.
create or replace function public.app_whatsapp_assert_admin(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role::text into v_role
  from public.app_current_user(p_token)
  limit 1;
  if coalesce(v_role, '') <> 'admin' then
    raise exception 'Sem permissão para configurar a automação do WhatsApp.';
  end if;
end;
$$;

create or replace function public.app_whatsapp_get_config(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.app_whatsapp_assert_admin(p_token);
  return jsonb_build_object(
    'settings', (select to_jsonb(s) from public.whatsapp_automation_settings s where s.id = true),
    'rules', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from public.whatsapp_automation_rules r), '[]'::jsonb),
    'contacts', coalesce((select jsonb_agg(to_jsonb(c) order by c.patient_name) from public.whatsapp_patient_contacts c), '[]'::jsonb),
    'logs', coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at desc) from (select * from public.whatsapp_message_log order by created_at desc limit 100) l), '[]'::jsonb)
  );
end;
$$;

create or replace function public.app_whatsapp_save_settings(
  p_token text,
  p_enabled boolean,
  p_provider_ready boolean,
  p_dispatch_timezone text,
  p_daily_dispatch_time time,
  p_business_phone_label text,
  p_default_template_language text,
  p_consent_text text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.whatsapp_automation_settings;
begin
  perform public.app_whatsapp_assert_admin(p_token);
  insert into public.whatsapp_automation_settings (
    id, enabled, provider_ready, dispatch_timezone, daily_dispatch_time,
    business_phone_label, default_template_language, consent_text, updated_at
  ) values (
    true, coalesce(p_enabled, false), coalesce(p_provider_ready, false),
    coalesce(nullif(trim(p_dispatch_timezone), ''), 'America/Sao_Paulo'),
    coalesce(p_daily_dispatch_time, '09:00:00'::time),
    coalesce(trim(p_business_phone_label), ''),
    coalesce(nullif(trim(p_default_template_language), ''), 'pt_BR'),
    coalesce(trim(p_consent_text), ''), now()
  ) on conflict (id) do update set
    enabled = excluded.enabled,
    provider_ready = excluded.provider_ready,
    dispatch_timezone = excluded.dispatch_timezone,
    daily_dispatch_time = excluded.daily_dispatch_time,
    business_phone_label = excluded.business_phone_label,
    default_template_language = excluded.default_template_language,
    consent_text = excluded.consent_text,
    updated_at = now()
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.app_whatsapp_upsert_contact(
  p_token text,
  p_patient_key text,
  p_patient_name text,
  p_phone_e164 text,
  p_consent_status text,
  p_consent_at timestamptz,
  p_consent_source text,
  p_automations_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.whatsapp_patient_contacts;
begin
  perform public.app_whatsapp_assert_admin(p_token);
  if coalesce(trim(p_patient_key), '') = '' then raise exception 'Paciente inválido.'; end if;
  insert into public.whatsapp_patient_contacts (
    patient_key, patient_name, phone_e164, consent_status, consent_at,
    consent_source, automations_enabled, updated_at
  ) values (
    trim(p_patient_key), coalesce(trim(p_patient_name), ''), coalesce(trim(p_phone_e164), ''),
    case when p_consent_status in ('pending', 'granted', 'withdrawn') then p_consent_status else 'pending' end,
    case when p_consent_status = 'granted' then coalesce(p_consent_at, now()) else p_consent_at end,
    coalesce(trim(p_consent_source), ''), coalesce(p_automations_enabled, false), now()
  ) on conflict (patient_key) do update set
    patient_name = excluded.patient_name,
    phone_e164 = excluded.phone_e164,
    consent_status = excluded.consent_status,
    consent_at = excluded.consent_at,
    consent_source = excluded.consent_source,
    automations_enabled = excluded.automations_enabled,
    updated_at = now()
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.app_whatsapp_sync_service_snapshot(
  p_token text,
  p_source_link_id text,
  p_patient_key text,
  p_patient_name text,
  p_service_id text,
  p_service_name text,
  p_start_date date,
  p_duration_days integer,
  p_service_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.whatsapp_service_snapshots;
begin
  perform public.app_whatsapp_assert_admin(p_token);
  if coalesce(trim(p_source_link_id), '') = '' or coalesce(trim(p_patient_key), '') = '' or p_start_date is null then
    raise exception 'Dados de serviço incompletos.';
  end if;
  insert into public.whatsapp_service_snapshots (
    source_link_id, patient_key, patient_name, service_id, service_name,
    start_date, duration_days, service_status, updated_at
  ) values (
    trim(p_source_link_id), trim(p_patient_key), coalesce(trim(p_patient_name), ''),
    coalesce(trim(p_service_id), ''), coalesce(trim(p_service_name), ''), p_start_date,
    greatest(coalesce(p_duration_days, 0), 0), coalesce(nullif(trim(p_service_status), ''), 'active'), now()
  ) on conflict (source_link_id) do update set
    patient_key = excluded.patient_key,
    patient_name = excluded.patient_name,
    service_id = excluded.service_id,
    service_name = excluded.service_name,
    start_date = excluded.start_date,
    duration_days = excluded.duration_days,
    service_status = excluded.service_status,
    updated_at = now()
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.app_whatsapp_upsert_rule(
  p_token text,
  p_id uuid,
  p_name text,
  p_service_id text,
  p_service_name text,
  p_offset_days integer,
  p_send_time time,
  p_template_name text,
  p_template_language text,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.whatsapp_automation_rules;
begin
  perform public.app_whatsapp_assert_admin(p_token);
  if coalesce(trim(p_name), '') = '' then raise exception 'Informe o nome da rotina.'; end if;
  if p_id is null then
    insert into public.whatsapp_automation_rules (
      name, service_id, service_name, offset_days, send_time,
      template_name, template_language, active
    ) values (
      trim(p_name), coalesce(trim(p_service_id), ''), coalesce(trim(p_service_name), ''),
      greatest(coalesce(p_offset_days, 0), 0), coalesce(p_send_time, '09:00:00'::time),
      coalesce(trim(p_template_name), ''), coalesce(nullif(trim(p_template_language), ''), 'pt_BR'), coalesce(p_active, false)
    ) returning * into v_row;
  else
    update public.whatsapp_automation_rules set
      name = trim(p_name), service_id = coalesce(trim(p_service_id), ''),
      service_name = coalesce(trim(p_service_name), ''), offset_days = greatest(coalesce(p_offset_days, 0), 0),
      send_time = coalesce(p_send_time, '09:00:00'::time), template_name = coalesce(trim(p_template_name), ''),
      template_language = coalesce(nullif(trim(p_template_language), ''), 'pt_BR'), active = coalesce(p_active, false), updated_at = now()
    where id = p_id returning * into v_row;
  end if;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.app_whatsapp_delete_rule(p_token text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.app_whatsapp_assert_admin(p_token);
  delete from public.whatsapp_automation_rules where id = p_id;
  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.app_whatsapp_get_config(text) to anon, authenticated;
grant execute on function public.app_whatsapp_save_settings(text, boolean, boolean, text, time, text, text, text) to anon, authenticated;
grant execute on function public.app_whatsapp_upsert_contact(text, text, text, text, text, timestamptz, text, boolean) to anon, authenticated;
grant execute on function public.app_whatsapp_sync_service_snapshot(text, text, text, text, text, text, date, integer, text) to anon, authenticated;
grant execute on function public.app_whatsapp_upsert_rule(text, uuid, text, text, text, integer, time, text, text, boolean) to anon, authenticated;
grant execute on function public.app_whatsapp_delete_rule(text, uuid) to anon, authenticated;

revoke all on public.whatsapp_automation_settings from anon, authenticated;
revoke all on public.whatsapp_patient_contacts from anon, authenticated;
revoke all on public.whatsapp_service_snapshots from anon, authenticated;
revoke all on public.whatsapp_automation_rules from anon, authenticated;
revoke all on public.whatsapp_message_log from anon, authenticated;
