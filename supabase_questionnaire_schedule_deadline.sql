-- Atualiza o prazo de resposta de um agendamento já existente.
-- Esta migração é idempotente e não cria, cancela ou dispara envios.

create or replace function public.app_questionnaire_schedule_update_deadline(
  p_token text,
  p_schedule_id uuid,
  p_expires_at timestamptz,
  p_invitation_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.questionnaire_schedules;
  v_status text;
begin
  perform public.app_questionnaire_schedule_assert_admin(p_token);

  if p_schedule_id is null or p_expires_at is null then
    raise exception 'Agendamento e prazo de resposta são obrigatórios.';
  end if;

  update public.questionnaire_schedules
  set expires_at = p_expires_at,
      invitation_token = case
        when nullif(trim(coalesce(p_invitation_token, '')), '') is not null
          then trim(p_invitation_token)
        else invitation_token
      end,
      updated_at = now()
  where id = p_schedule_id
    and p_expires_at > scheduled_for
    and status not in ('cancelado', 'enviado', 'entregue', 'expirado')
  returning * into v_row;

  if not found then
    select status into v_status
    from public.questionnaire_schedules
    where id = p_schedule_id;

    if v_status is null then
      raise exception 'Agendamento não encontrado.';
    end if;
    raise exception 'Este agendamento não pode mais ter o prazo alterado.';
  end if;

  -- O endpoint serverless usa o token apenas internamente para renová-lo;
  -- o frontend recebe somente os campos normalizados da agenda.
  return to_jsonb(v_row) - 'quiz_snapshot';
end;
$$;

grant execute on function public.app_questionnaire_schedule_update_deadline(text, uuid, timestamptz, text) to anon, authenticated;
