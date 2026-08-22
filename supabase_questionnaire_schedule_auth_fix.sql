-- Corrige a autorização da fila quando app_current_user retorna jsonb.
-- Execute no SQL Editor do projeto Supabase.
create or replace function public.app_questionnaire_schedule_assert_admin(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user jsonb;
  v_role text;
begin
  v_user := public.app_current_user(p_token);
  v_role := coalesce(v_user ->> 'role', '');
  if v_role <> 'admin' then
    raise exception 'Sem permissão para administrar os agendamentos de questionários.';
  end if;
end;
$$;

revoke all on function public.app_questionnaire_schedule_assert_admin(text) from public;
grant execute on function public.app_questionnaire_schedule_assert_admin(text) to anon, authenticated;
