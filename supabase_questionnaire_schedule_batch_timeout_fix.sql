-- Corrige o timeout do cadastro de séries diárias.
-- Esta migração altera somente a função de enfileiramento em lote.
-- Não envia e-mails e não modifica registros já existentes fora dos schedule_key
-- recebidos na chamada de cadastro.

create or replace function public.app_questionnaire_schedule_enqueue_batch(
  p_token text,
  p_entries jsonb
)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_items jsonb := coalesce(p_entries, '[]'::jsonb);
begin
  perform public.app_questionnaire_schedule_assert_admin(p_token);

  if jsonb_typeof(v_items) <> 'array' then
    raise exception 'A lista de agendamentos precisa ser um array.';
  end if;

  if jsonb_array_length(v_items) > 180 then
    raise exception 'A série não pode conter mais de 180 envios por operação.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_items) as item(
      "scheduleKey" text,
      "patientKey" text,
      "patientName" text,
      "recipientEmail" text,
      "quizLinkId" text,
      "quizId" text,
      "quizTitle" text,
      "quizSnapshot" jsonb,
      "invitationToken" text,
      "scheduledFor" timestamptz,
      "expiresAt" timestamptz
    )
    where coalesce(trim(item."scheduleKey"), '') = ''
       or coalesce(trim(item."patientKey"), '') = ''
       or coalesce(trim(item."quizId"), '') = ''
       or lower(trim(coalesce(item."recipientEmail", ''))) !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
       or item."quizSnapshot" is null
       or jsonb_typeof(item."quizSnapshot") <> 'object'
       or coalesce(trim(item."invitationToken"), '') = ''
       or item."scheduledFor" is null
       or item."scheduledFor" <= now() + interval '30 seconds'
       or item."scheduledFor" > now() + interval '180 days'
       or item."expiresAt" is null
       or item."expiresAt" <= item."scheduledFor"
  ) then
    raise exception 'Há dados inválidos na lista de agendamentos.';
  end if;

  return query
  with upserted as (
    insert into public.questionnaire_schedules (
      schedule_key, patient_key, patient_name, recipient_email, quiz_link_id,
      quiz_id, quiz_title, quiz_snapshot, invitation_token, scheduled_for,
      expires_at, status, retryable, next_attempt_at, updated_at
    )
    select
      trim(item."scheduleKey"),
      trim(item."patientKey"),
      coalesce(trim(item."patientName"), ''),
      lower(trim(item."recipientEmail")),
      coalesce(trim(item."quizLinkId"), ''),
      trim(item."quizId"),
      coalesce(trim(item."quizTitle"), ''),
      item."quizSnapshot",
      trim(item."invitationToken"),
      item."scheduledFor",
      item."expiresAt",
      'aguardando_brevo',
      true,
      now(),
      now()
    from jsonb_to_recordset(v_items) as item(
      "scheduleKey" text,
      "patientKey" text,
      "patientName" text,
      "recipientEmail" text,
      "quizLinkId" text,
      "quizId" text,
      "quizTitle" text,
      "quizSnapshot" jsonb,
      "invitationToken" text,
      "scheduledFor" timestamptz,
      "expiresAt" timestamptz
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
    returning *
  )
  select to_jsonb(upserted.*) - 'invitation_token' - 'quiz_snapshot'
  from upserted;
end;
$$;

grant execute on function public.app_questionnaire_schedule_enqueue_batch(text, jsonb) to anon, authenticated;
