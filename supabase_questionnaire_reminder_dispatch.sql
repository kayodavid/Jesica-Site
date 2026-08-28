-- Atualiza a fila existente de questionários para suportar lembretes de e-mail
-- processados pelo mesmo worker protegido. Esta migração não envia mensagens.
-- Execute uma vez no SQL Editor do projeto Supabase antes de ativar o fluxo em produção.

create or replace function public.app_questionnaire_schedule_mark_sent(
  p_secret text,
  p_schedule_id uuid,
  p_provider_message_id text,
  p_provider_status text default 'sent'
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
  if coalesce(trim(p_provider_message_id), '') = '' then
    raise exception 'O provedor não retornou o identificador do lembrete.';
  end if;
  update public.questionnaire_schedules
  set status = 'enviado',
      retryable = false,
      provider_message_id = trim(p_provider_message_id),
      provider_status = nullif(trim(coalesce(p_provider_status, 'sent')), ''),
      scheduled_at_brevo = coalesce(scheduled_at_brevo, now()),
      sent_at = coalesce(sent_at, now()),
      last_error = null,
      final_failure_at = null,
      claimed_at = null,
      updated_at = now()
  where id = p_schedule_id
    and status = 'tentando_agendar'
  returning * into v_row;
  if not found then
    raise exception 'Agendamento não está reservado para este worker.';
  end if;
  return to_jsonb(v_row) - 'invitation_token' - 'quiz_snapshot';
end;
$$;

grant execute on function public.app_questionnaire_schedule_mark_sent(text, uuid, text, text) to anon, authenticated;

-- Verificação opcional após executar:
-- select proname from pg_proc where proname = 'app_questionnaire_schedule_mark_sent';
