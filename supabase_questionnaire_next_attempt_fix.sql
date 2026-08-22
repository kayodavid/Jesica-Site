-- Mantém next_attempt_at preenchido nos estados finais da fila.
-- O worker continua impedido por retryable=false.

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
      next_attempt_at = now(),
      claimed_at = null,
      updated_at = now()
  where ((status in ('aguardando_brevo', 'falha_de_agendamento') and scheduled_for <= now() + interval '10 minutes')
     or (status = 'tentando_agendar' and claimed_at < now() - interval '20 minutes'))
    and provider_message_id is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.app_questionnaire_schedule_finalize_missed(text) to anon, authenticated;

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
      next_attempt_at = case when coalesce(v_can_retry, false) then now() + interval '15 minutes' else now() end,
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

grant execute on function public.app_questionnaire_schedule_mark_failure(text, uuid, text, boolean) to anon, authenticated;

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
      next_attempt_at = now(),
      claimed_at = null,
      updated_at = now()
  where id = p_schedule_id
    and status = 'tentando_agendar'
  returning * into v_row;
  if not found then raise exception 'Agendamento não está reservado para este worker.'; end if;
  return to_jsonb(v_row) - 'invitation_token' - 'quiz_snapshot';
end;
$$;

grant execute on function public.app_questionnaire_schedule_mark_provider(text, uuid, text, text) to anon, authenticated;
