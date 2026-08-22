-- Permite persistir uma série diária em uma única chamada protegida.
-- Execute este arquivo no SQL Editor do projeto Supabase.

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
  v_entry jsonb;
  v_result jsonb;
  v_items jsonb := coalesce(p_entries, '[]'::jsonb);
begin
  perform public.app_questionnaire_schedule_assert_admin(p_token);
  if jsonb_typeof(v_items) <> 'array' then
    raise exception 'A lista de agendamentos precisa ser um array.';
  end if;
  if jsonb_array_length(v_items) > 180 then
    raise exception 'A série não pode conter mais de 180 envios por operação.';
  end if;
  for v_entry in select value from jsonb_array_elements(v_items) loop
    v_result := public.app_questionnaire_schedule_enqueue(
      p_token,
      v_entry ->> 'scheduleKey',
      v_entry ->> 'patientKey',
      v_entry ->> 'patientName',
      v_entry ->> 'recipientEmail',
      v_entry ->> 'quizLinkId',
      v_entry ->> 'quizId',
      v_entry ->> 'quizTitle',
      v_entry -> 'quizSnapshot',
      v_entry ->> 'invitationToken',
      (v_entry ->> 'scheduledFor')::timestamptz,
      (v_entry ->> 'expiresAt')::timestamptz
    );
    return next v_result;
  end loop;
end;
$$;

grant execute on function public.app_questionnaire_schedule_enqueue_batch(text, jsonb) to anon, authenticated;
