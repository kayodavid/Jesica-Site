-- Adiciona pausa e retomada por agendamento individual.
-- Execute este arquivo no SQL Editor do projeto Supabase.

alter table public.questionnaire_schedules
  drop constraint if exists questionnaire_schedules_status_check;

alter table public.questionnaire_schedules
  add constraint questionnaire_schedules_status_check
  check (status in (
    'aguardando_brevo', 'tentando_agendar', 'agendado_na_brevo',
    'falha_de_agendamento', 'pausado', 'enviado', 'entregue',
    'cancelado', 'expirado'
  ));

create or replace function public.app_questionnaire_schedule_pause(
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
  set status = 'pausado',
      retryable = false,
      next_attempt_at = now(),
      claimed_at = null,
      updated_at = now()
  where id = p_schedule_id
    and status in ('aguardando_brevo', 'agendado_na_brevo', 'falha_de_agendamento')
  returning * into v_row;
  if not found then
    select * into v_row from public.questionnaire_schedules where id = p_schedule_id;
  end if;
  if v_row.id is null then raise exception 'Agendamento não encontrado.'; end if;
  if v_row.status <> 'pausado' then raise exception 'Este agendamento está sendo processado ou não pode ser pausado agora.'; end if;
  return to_jsonb(v_row) - 'invitation_token' - 'quiz_snapshot';
end;
$$;

create or replace function public.app_questionnaire_schedule_resume(
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
  set status = 'aguardando_brevo',
      retryable = true,
      next_attempt_at = now(),
      last_error = null,
      final_failure_at = null,
      claimed_at = null,
      updated_at = now()
  where id = p_schedule_id
    and status = 'pausado'
    and scheduled_for > now() + interval '30 seconds'
  returning * into v_row;
  if not found then
    select * into v_row from public.questionnaire_schedules where id = p_schedule_id;
  end if;
  if v_row.id is null then raise exception 'Agendamento não encontrado.'; end if;
  if v_row.status = 'pausado' then raise exception 'O horário deste agendamento já passou ou não pode ser retomado.'; end if;
  return to_jsonb(v_row) - 'invitation_token' - 'quiz_snapshot';
end;
$$;

grant execute on function public.app_questionnaire_schedule_pause(text, uuid) to anon, authenticated;
grant execute on function public.app_questionnaire_schedule_resume(text, uuid) to anon, authenticated;
