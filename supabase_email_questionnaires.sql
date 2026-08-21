-- Questionários por e-mail — Jessica Melo Nutricionista
-- Execute este arquivo uma única vez no SQL Editor do projeto Supabase.
-- A migração cria convites com token de alta entropia e armazena apenas o hash do token.

create extension if not exists pgcrypto;

create table if not exists public.email_quiz_invitations (
  id uuid primary key default gen_random_uuid(),
  access_token_hash text not null unique,
  patient_key text not null,
  patient_name text not null default '',
  recipient_email text not null,
  quiz_link_id text not null default '',
  quiz_id text not null,
  quiz_title text not null default '',
  quiz_snapshot jsonb not null,
  status text not null default 'created' check (status in ('created', 'sent', 'opened', 'answered', 'expired', 'cancelled', 'send_failed')),
  provider_message_id text,
  sent_at timestamptz,
  opened_at timestamptz,
  answered_at timestamptz,
  expires_at timestamptz not null,
  answers jsonb,
  response_summary jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_quiz_invitations_patient_idx
  on public.email_quiz_invitations (patient_key, created_at desc);
create index if not exists email_quiz_invitations_status_idx
  on public.email_quiz_invitations (status, expires_at);

alter table public.email_quiz_invitations enable row level security;
revoke all on public.email_quiz_invitations from anon, authenticated;

create or replace function public.app_email_quiz_assert_admin(p_token text)
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
    raise exception 'Sem permissão para enviar questionários por e-mail.';
  end if;
end;
$$;

create or replace function public.app_email_quiz_create_invitation(
  p_token text,
  p_patient_key text,
  p_patient_name text,
  p_recipient_email text,
  p_quiz_link_id text,
  p_quiz_id text,
  p_quiz_title text,
  p_quiz_snapshot jsonb,
  p_expires_in_days integer default 14
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.email_quiz_invitations;
  v_access_token text;
  v_hash text;
  v_days integer;
begin
  perform public.app_email_quiz_assert_admin(p_token);

  if coalesce(trim(p_patient_key), '') = '' then
    raise exception 'Paciente inválido.';
  end if;
  if coalesce(trim(p_recipient_email), '') !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'O paciente não possui um e-mail válido cadastrado.';
  end if;
  if coalesce(trim(p_quiz_id), '') = '' or coalesce(trim(p_quiz_title), '') = '' then
    raise exception 'Questionário inválido.';
  end if;
  if p_quiz_snapshot is null or jsonb_typeof(p_quiz_snapshot) <> 'object' then
    raise exception 'Não foi possível registrar a versão do questionário.';
  end if;

  v_days := greatest(1, least(coalesce(p_expires_in_days, 14), 60));
  v_access_token := encode(gen_random_bytes(32), 'hex');
  v_hash := encode(digest(v_access_token, 'sha256'), 'hex');

  insert into public.email_quiz_invitations (
    access_token_hash, patient_key, patient_name, recipient_email,
    quiz_link_id, quiz_id, quiz_title, quiz_snapshot, expires_at
  ) values (
    v_hash, trim(p_patient_key), coalesce(trim(p_patient_name), ''), lower(trim(p_recipient_email)),
    coalesce(trim(p_quiz_link_id), ''), trim(p_quiz_id), trim(p_quiz_title), p_quiz_snapshot,
    now() + make_interval(days => v_days)
  ) returning * into v_invitation;

  return jsonb_build_object(
    'invitation_id', v_invitation.id,
    'access_token', v_access_token,
    'expires_at', v_invitation.expires_at,
    'recipient_email', v_invitation.recipient_email
  );
end;
$$;

create or replace function public.app_email_quiz_mark_sent(
  p_token text,
  p_invitation_id uuid,
  p_provider_message_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.email_quiz_invitations;
begin
  perform public.app_email_quiz_assert_admin(p_token);

  update public.email_quiz_invitations
  set status = 'sent',
      provider_message_id = nullif(trim(coalesce(p_provider_message_id, '')), ''),
      sent_at = now(),
      error_message = null,
      updated_at = now()
  where id = p_invitation_id
    and status in ('created', 'send_failed')
  returning * into v_invitation;

  if not found then
    raise exception 'Convite não encontrado ou já processado.';
  end if;

  return to_jsonb(v_invitation.id);
end;
$$;

create or replace function public.app_email_quiz_mark_send_failed(
  p_token text,
  p_invitation_id uuid,
  p_error_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.app_email_quiz_assert_admin(p_token);

  update public.email_quiz_invitations
  set status = 'send_failed',
      error_message = left(coalesce(p_error_message, ''), 1000),
      updated_at = now()
  where id = p_invitation_id
    and status = 'created';

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.app_email_quiz_list(
  p_token text,
  p_patient_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.app_email_quiz_assert_admin(p_token);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', i.id,
      'patient_key', i.patient_key,
      'patient_name', i.patient_name,
      'recipient_email', i.recipient_email,
      'quiz_link_id', i.quiz_link_id,
      'quiz_id', i.quiz_id,
      'quiz_title', i.quiz_title,
      'status', case when i.status in ('created', 'sent', 'opened') and i.expires_at <= now() then 'expired' else i.status end,
      'sent_at', i.sent_at,
      'opened_at', i.opened_at,
      'answered_at', i.answered_at,
      'expires_at', i.expires_at,
      'response_summary', i.response_summary,
      'error_message', i.error_message,
      'created_at', i.created_at
    ) order by i.created_at desc)
    from public.email_quiz_invitations i
    where p_patient_key is null or i.patient_key = trim(p_patient_key)
  ), '[]'::jsonb);
end;
$$;

create or replace function public.app_email_quiz_get_public_invitation(
  p_access_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.email_quiz_invitations;
  v_hash text;
begin
  if coalesce(trim(p_access_token), '') = '' then
    return jsonb_build_object('state', 'invalid');
  end if;

  v_hash := encode(digest(trim(p_access_token), 'sha256'), 'hex');
  select * into v_invitation
  from public.email_quiz_invitations
  where access_token_hash = v_hash
  limit 1;

  if not found then
    return jsonb_build_object('state', 'invalid');
  end if;

  if v_invitation.expires_at <= now() then
    update public.email_quiz_invitations
    set status = 'expired', updated_at = now()
    where id = v_invitation.id and status not in ('answered', 'cancelled');
    return jsonb_build_object('state', 'expired');
  end if;

  if v_invitation.status = 'answered' then
    return jsonb_build_object('state', 'answered', 'quiz_title', v_invitation.quiz_title);
  end if;
  if v_invitation.status in ('cancelled', 'send_failed') then
    return jsonb_build_object('state', 'invalid');
  end if;

  update public.email_quiz_invitations
  set status = 'opened', opened_at = coalesce(opened_at, now()), updated_at = now()
  where id = v_invitation.id and status in ('created', 'sent', 'opened');

  return jsonb_build_object(
    'state', 'ready',
    'invitation_id', v_invitation.id,
    'patient_name', v_invitation.patient_name,
    'quiz_title', v_invitation.quiz_title,
    'quiz', v_invitation.quiz_snapshot,
    'expires_at', v_invitation.expires_at
  );
end;
$$;

create or replace function public.app_email_quiz_submit_response(
  p_access_token text,
  p_answers jsonb,
  p_response_summary jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.email_quiz_invitations;
  v_hash text;
begin
  if coalesce(trim(p_access_token), '') = '' or p_answers is null or jsonb_typeof(p_answers) <> 'array' then
    return jsonb_build_object('success', false, 'reason', 'invalid');
  end if;

  v_hash := encode(digest(trim(p_access_token), 'sha256'), 'hex');
  select * into v_invitation
  from public.email_quiz_invitations
  where access_token_hash = v_hash
  for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'invalid');
  end if;
  if v_invitation.expires_at <= now() then
    update public.email_quiz_invitations set status = 'expired', updated_at = now() where id = v_invitation.id;
    return jsonb_build_object('success', false, 'reason', 'expired');
  end if;
  if v_invitation.status = 'answered' then
    return jsonb_build_object('success', false, 'reason', 'already_answered');
  end if;
  if v_invitation.status in ('cancelled', 'send_failed') then
    return jsonb_build_object('success', false, 'reason', 'invalid');
  end if;

  update public.email_quiz_invitations
  set status = 'answered',
      answers = p_answers,
      response_summary = coalesce(p_response_summary, '{}'::jsonb),
      answered_at = now(),
      updated_at = now()
  where id = v_invitation.id;

  return jsonb_build_object('success', true, 'quiz_title', v_invitation.quiz_title);
end;
$$;

grant execute on function public.app_email_quiz_create_invitation(text, text, text, text, text, text, text, jsonb, integer) to anon, authenticated;
grant execute on function public.app_email_quiz_mark_sent(text, uuid, text) to anon, authenticated;
grant execute on function public.app_email_quiz_mark_send_failed(text, uuid, text) to anon, authenticated;
grant execute on function public.app_email_quiz_list(text, text) to anon, authenticated;
grant execute on function public.app_email_quiz_get_public_invitation(text) to anon, authenticated;
grant execute on function public.app_email_quiz_submit_response(text, jsonb, jsonb) to anon, authenticated;
