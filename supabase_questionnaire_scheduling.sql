-- Fila persistente de agendamentos de questionários por e-mail.
-- Execute este arquivo no SQL Editor do projeto Supabase.
-- Depois configure o mesmo QUESTIONNAIRE_SCHEDULER_SECRET na Vercel e no Vault,
-- conforme as instruções ao final deste arquivo.

create extension if not exists pgcrypto;
create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.questionnaire_schedules (
  id uuid primary key default gen_random_uuid(),
  schedule_key text not null unique,
  patient_key text not null,
  patient_name text not null default '',
  recipient_email text not null,
  quiz_link_id text not null default '',
  quiz_id text not null,
  quiz_title text not null default '',
  quiz_snapshot jsonb not null,
  invitation_token text not null,
  scheduled_for timestamptz not null,
  expires_at timestamptz not null,
  provider text not null default 'brevo',
  provider_message_id text,
  provider_status text,
  status text not null default 'aguardando_brevo'
    check (status in ('aguardando_brevo', 'tentando_agendar', 'agendado_na_brevo', 'falha_de_agendamento', 'enviado', 'entregue', 'cancelado', 'expirado')),
  retryable boolean not null default true,
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  last_error text,
  claimed_at timestamptz,
  claimed_by text,
  scheduled_at_brevo timestamptz,
  sent_at timestamptz,
  cancelled_at timestamptz,
  final_failure_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint questionnaire_schedules_future_check check (scheduled_for > created_at - interval '5 minutes'),
  constraint questionnaire_schedules_expiry_check check (expires_at > scheduled_for)
);

create index if not exists questionnaire_schedules_due_idx
  on public.questionnaire_schedules (status, retryable, next_attempt_at, scheduled_for);
create index if not exists questionnaire_schedules_patient_idx
  on public.questionnaire_schedules (patient_key, scheduled_for desc);
create index if not exists questionnaire_schedules_link_idx
  on public.questionnaire_schedules (quiz_link_id, scheduled_for desc);
create unique index if not exists questionnaire_schedules_provider_idx
  on public.questionnaire_schedules (provider_message_id)
  where provider_message_id is not null;

alter table public.questionnaire_schedules enable row level security;
revoke all on public.questionnaire_schedules from anon, authenticated;

create or replace function public.app_questionnaire_schedule_assert_admin(p_token text)
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
    raise exception 'Sem permissão para administrar os agendamentos de questionários.';
  end if;
end;
$$;

create or replace function public.app_questionnaire_schedule_enqueue(
  p_token text,
  p_schedule_key text,
  p_patient_key text,
  p_patient_name text,
  p_recipient_email text,
  p_quiz_link_id text,
  p_quiz_id text,
  p_quiz_title text,
  p_quiz_snapshot jsonb,
  p_invitation_token text,
  p_scheduled_for timestamptz,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.questionnaire_schedules;
  v_key text := nullif(trim(coalesce(p_schedule_key, '')), '');
  v_email text := lower(trim(coalesce(p_recipient_email, '')));
begin
  perform public.app_questionnaire_schedule_assert_admin(p_token);
  if v_key is null or coalesce(trim(p_patient_key), '') = '' or coalesce(trim(p_quiz_id), '') = '' then
    raise exception 'Dados insuficientes para criar o agendamento.';
  end if;
  if v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'O paciente não possui um e-mail válido cadastrado.';
  end if;
  if p_quiz_snapshot is null or jsonb_typeof(p_quiz_snapshot) <> 'object' then
    raise exception 'A versão do questionário não foi informada.';
  end if;
  if coalesce(trim(p_invitation_token), '') = '' then
    raise exception 'Não foi possível proteger o convite do questionário.';
  end if;
  if p_scheduled_for is null or p_scheduled_for <= now() + interval '30 seconds' then
    raise exception 'O horário agendado precisa estar no futuro.';
  end if;
  if p_scheduled_for > now() + interval '180 days' then
    raise exception 'O agendamento não pode ultrapassar 180 dias.';
  end if;
  if p_expires_at is null or p_expires_at <= p_scheduled_for then
    raise exception 'O prazo de resposta precisa ocorrer depois do envio.';
  end if;

  insert into public.questionnaire_schedules (
    schedule_key, patient_key, patient_name, recipient_email, quiz_link_id,
    quiz_id, quiz_title, quiz_snapshot, invitation_token, scheduled_for,
    expires_at, status, retryable, next_attempt_at, updated_at
  ) values (
    v_key, trim(p_patient_key), coalesce(trim(p_patient_name), ''), v_email,
    coalesce(trim(p_quiz_link_id), ''), trim(p_quiz_id), coalesce(trim(p_quiz_title), ''),
    p_quiz_snapshot, trim(p_invitation_token), p_scheduled_for, p_expires_at,
    'aguardando_brevo', true, now(), now()
  )
  on conflict (schedule_key) do update set
    patient_key = excluded.patient_key,
    patient_name = excluded.patient_name,
    recipient_email = excluded.recipient_email,
    quiz_link_id = excluded.quiz_link_id,
    quiz_id = excluded.quiz_id,
    quiz_title = excluded.quiz_title,
    quiz_snapshot = excluded.quiz_snapshot,
    invitation_token = case
      when questionnaire_schedules.status in ('aguardando_brevo', 'falha_de_agendamento') then excluded.invitation_token
      else questionnaire_schedules.invitation_token
    end,
    scheduled_for = case
      when questionnaire_schedules.status in ('aguardando_brevo', 'falha_de_agendamento') then excluded.scheduled_for
      else questionnaire_schedules.scheduled_for
    end,
    expires_at = case
      when questionnaire_schedules.status in ('aguardando_brevo', 'falha_de_agendamento') then excluded.expires_at
      else questionnaire_schedules.expires_at
    end,
    status = case
      when questionnaire_schedules.status in ('aguardando_brevo', 'falha_de_agendamento') then 'aguardando_brevo'
      else questionnaire_schedules.status
    end,
    retryable = case
      when questionnaire_schedules.status in ('aguardando_brevo', 'falha_de_agendamento') then true
      else questionnaire_schedules.retryable
    end,
    next_attempt_at = case
      when questionnaire_schedules.status in ('aguardando_brevo', 'falha_de_agendamento') then now()
      else questionnaire_schedules.next_attempt_at
    end,
    last_error = case
      when questionnaire_schedules.status in ('aguardando_brevo', 'falha_de_agendamento') then null
      else questionnaire_schedules.last_error
    end,
    updated_at = now()
  returning * into v_row;

  if not found then
    select * into v_row from public.questionnaire_schedules where schedule_key = v_key;
  end if;
  return to_jsonb(v_row) - 'invitation_token' - 'quiz_snapshot';
end;
$$;

create or replace function public.app_questionnaire_schedule_list(
  p_token text,
  p_patient_key text default null,
  p_quiz_link_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.app_questionnaire_schedule_assert_admin(p_token);
  return coalesce((
    select jsonb_agg(
      (to_jsonb(s) - 'invitation_token' - 'quiz_snapshot')
      order by s.scheduled_for asc
    )
    from public.questionnaire_schedules s
    where (nullif(trim(coalesce(p_patient_key, '')), '') is null or s.patient_key = trim(p_patient_key))
      and (nullif(trim(coalesce(p_quiz_link_id, '')), '') is null or s.quiz_link_id = trim(p_quiz_link_id))
  ), '[]'::jsonb);
end;
$$;

create or replace function public.app_questionnaire_schedule_cancel(
  p_token text,
  p_schedule_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.questionnaire_schedules;
begin
  perform public.app_questionnaire_schedule_assert_admin(p_token);
  update public.questionnaire_schedules
  set status = 'cancelado',
      retryable = false,
      cancelled_at = coalesce(cancelled_at, now()),
      updated_at = now()
  where id = p_schedule_id
    and status not in ('cancelado', 'enviado', 'entregue')
  returning * into v_row;
  if not found then
    select * into v_row from public.questionnaire_schedules where id = p_schedule_id;
  end if;
  if v_row.id is null then raise exception 'Agendamento não encontrado.'; end if;
  return to_jsonb(v_row) - 'invitation_token' - 'quiz_snapshot';
end;
$$;

create or replace function public.app_questionnaire_schedule_worker_assert(p_secret text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected text;
begin
  select decrypted_secret into v_expected
  from vault.decrypted_secrets
  where name = 'questionnaire_scheduler_secret'
  limit 1;
  if coalesce(v_expected, '') = '' or coalesce(p_secret, '') = '' or v_expected <> p_secret then
    raise exception 'Segredo do abastecedor inválido.';
  end if;
end;
$$;

create or replace function public.app_questionnaire_schedule_claim(
  p_secret text,
  p_worker_id text default 'supabase-pg-cron',
  p_limit integer default 20
)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.app_questionnaire_schedule_worker_assert(p_secret);
  return query
  with candidates as (
    select s.id
    from public.questionnaire_schedules s
    where s.status in ('aguardando_brevo', 'falha_de_agendamento')
      and s.retryable = true
      and s.next_attempt_at <= now()
      and s.scheduled_for > now() + interval '10 minutes'
      and s.scheduled_for <= now() + interval '71 hours'
    order by s.scheduled_for asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 50))
  ), claimed as (
    update public.questionnaire_schedules s
    set status = 'tentando_agendar',
        attempt_count = s.attempt_count + 1,
        last_attempt_at = now(),
        claimed_at = now(),
        claimed_by = coalesce(nullif(trim(p_worker_id), ''), 'supabase-pg-cron'),
        next_attempt_at = now() + interval '15 minutes',
        updated_at = now()
    from candidates c
    where s.id = c.id
    returning s.*
  )
  select to_jsonb(claimed.*)
  from claimed;
end;
$$;

create or replace function public.app_questionnaire_schedule_finalize_missed(p_secret text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  perform public.app_questionnaire_schedule_worker_assert(p_secret);
  update public.questionnaire_schedules
  set status = 'falha_de_agendamento',
      retryable = false,
      last_error = 'O envio não foi cadastrado na Brevo dentro da margem de segurança.',
      final_failure_at = now(),
      next_attempt_at = null,
      claimed_at = null,
      updated_at = now()
  where ((status in ('aguardando_brevo', 'falha_de_agendamento') and scheduled_for <= now() + interval '10 minutes')
     or (status = 'tentando_agendar' and claimed_at < now() - interval '20 minutes'))
    and provider_message_id is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.app_questionnaire_schedule_mark_provider(
  p_secret text,
  p_schedule_id uuid,
  p_provider_message_id text,
  p_provider_status text default 'scheduled'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.questionnaire_schedules;
begin
  perform public.app_questionnaire_schedule_worker_assert(p_secret);
  if coalesce(trim(p_provider_message_id), '') = '' then raise exception 'A Brevo não retornou o messageId.'; end if;
  update public.questionnaire_schedules
  set status = 'agendado_na_brevo',
      retryable = false,
      provider_message_id = trim(p_provider_message_id),
      provider_status = nullif(trim(coalesce(p_provider_status, '')), ''),
      scheduled_at_brevo = now(),
      last_error = null,
      final_failure_at = null,
      next_attempt_at = null,
      claimed_at = null,
      updated_at = now()
  where id = p_schedule_id
    and status = 'tentando_agendar'
  returning * into v_row;
  if not found then raise exception 'Agendamento não está reservado para este worker.'; end if;
  return to_jsonb(v_row) - 'invitation_token' - 'quiz_snapshot';
end;
$$;

create or replace function public.app_questionnaire_schedule_mark_failure(
  p_secret text,
  p_schedule_id uuid,
  p_error_message text,
  p_retryable boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.questionnaire_schedules;
  v_can_retry boolean;
begin
  perform public.app_questionnaire_schedule_worker_assert(p_secret);
  select (p_retryable and scheduled_for > now() + interval '1 hour') into v_can_retry
  from public.questionnaire_schedules
  where id = p_schedule_id;
  update public.questionnaire_schedules
  set status = 'falha_de_agendamento',
      retryable = coalesce(v_can_retry, false),
      last_error = left(coalesce(p_error_message, 'Falha ao cadastrar o envio na Brevo.'), 1000),
      next_attempt_at = case when coalesce(v_can_retry, false) then now() + interval '15 minutes' else null end,
      final_failure_at = case when coalesce(v_can_retry, false) then null else now() end,
      claimed_at = null,
      updated_at = now()
  where id = p_schedule_id
    and status = 'tentando_agendar'
  returning * into v_row;
  if not found then raise exception 'Agendamento não está reservado para este worker.'; end if;
  return to_jsonb(v_row) - 'invitation_token' - 'quiz_snapshot';
end;
$$;

create or replace function public.app_questionnaire_schedule_mark_status(
  p_secret text,
  p_schedule_id uuid,
  p_status text,
  p_provider_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.questionnaire_schedules;
  v_status text := lower(trim(coalesce(p_status, '')));
begin
  perform public.app_questionnaire_schedule_worker_assert(p_secret);
  if v_status not in ('agendado_na_brevo', 'enviado', 'entregue', 'expirado') then raise exception 'Status inválido.'; end if;
  update public.questionnaire_schedules
  set status = v_status,
      provider_status = coalesce(nullif(trim(coalesce(p_provider_status, '')), ''), provider_status),
      sent_at = case when v_status in ('enviado', 'entregue') then coalesce(sent_at, now()) else sent_at end,
      updated_at = now()
  where id = p_schedule_id
  returning * into v_row;
  if not found then raise exception 'Agendamento não encontrado.'; end if;
  return to_jsonb(v_row) - 'invitation_token' - 'quiz_snapshot';
end;
$$;

grant execute on function public.app_questionnaire_schedule_assert_admin(text) to anon, authenticated;
grant execute on function public.app_questionnaire_schedule_enqueue(text, text, text, text, text, text, text, text, jsonb, text, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.app_questionnaire_schedule_list(text, text, text) to anon, authenticated;
grant execute on function public.app_questionnaire_schedule_cancel(text, uuid) to anon, authenticated;
grant execute on function public.app_questionnaire_schedule_worker_assert(text) to anon, authenticated;
grant execute on function public.app_questionnaire_schedule_claim(text, text, integer) to anon, authenticated;
grant execute on function public.app_questionnaire_schedule_finalize_missed(text) to anon, authenticated;
grant execute on function public.app_questionnaire_schedule_mark_provider(text, uuid, text, text) to anon, authenticated;
grant execute on function public.app_questionnaire_schedule_mark_failure(text, uuid, text, boolean) to anon, authenticated;
grant execute on function public.app_questionnaire_schedule_mark_status(text, uuid, text, text) to anon, authenticated;

-- Configuração do worker a cada 15 minutos. Substitua o valor abaixo pelo mesmo
-- QUESTIONNAIRE_SCHEDULER_SECRET configurado como variável server-side na Vercel.
-- Execute esta seção somente depois de criar o segredo no Vault.
--
-- select vault.create_secret(
--   'https://jessicamelonutri.com.br/api/questionnaire-scheduler',
--   'questionnaire_scheduler_url',
--   'URL do abastecedor de questionários'
-- );
-- select vault.create_secret(
--   'SUBSTITUA_PELO_MESMO_QUESTIONNAIRE_SCHEDULER_SECRET_DA_VERCEL',
--   'questionnaire_scheduler_secret',
--   'Segredo do abastecedor de questionários'
-- );
-- select cron.unschedule(jobid) from cron.job where jobname = 'jessica-questionnaire-scheduler';
-- select cron.schedule(
--   'jessica-questionnaire-scheduler',
--   '*/15 * * * *',
--   $$
--     select net.http_post(
--       url := (select decrypted_secret from vault.decrypted_secrets where name = 'questionnaire_scheduler_url'),
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'questionnaire_scheduler_secret')
--       ),
--       body := jsonb_build_object('source', 'supabase-pg-cron')
--     ) as request_id;
--   $$
-- );
-- select jobid, jobname, schedule, active from cron.job where jobname = 'jessica-questionnaire-scheduler';
