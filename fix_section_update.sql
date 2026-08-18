-- Correção robusta da atualização de Seções
create or replace function public.app_update_section(p_token text, p_id uuid, p_name text, p_cover_image text default '')
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare old_name text; clean_name text := trim(coalesce(p_name, ''));
begin
  if not exists (select 1 from public.app_sessions s join public.app_users u on u.id = s.user_id where s.token = p_token and s.expires_at > now() and u.role = 'admin') then
    return jsonb_build_object('success', false, 'message', 'Acesso não autorizado.');
  end if;
  if clean_name = '' then return jsonb_build_object('success', false, 'message', 'Informe o nome da seção.'); end if;
  select name into old_name from public.content_sections where id = p_id;
  if old_name is null then return jsonb_build_object('success', false, 'message', 'Seção não encontrada.'); end if;
  if exists (select 1 from public.content_sections where lower(name) = lower(clean_name) and id <> p_id) then return jsonb_build_object('success', false, 'message', 'Já existe outra seção com esse nome.'); end if;
  update public.content_sections set name = clean_name, cover_image = case when coalesce(trim(p_cover_image), '') = '' then cover_image else p_cover_image end, updated_at = now() where id = p_id;
  update public.educational_videos set theme = clean_name where theme = old_name;
  update public.educational_ebooks set theme = clean_name where theme = old_name;
  return jsonb_build_object('success', true);
exception when others then
  return jsonb_build_object('success', false, 'message', sqlerrm);
end;
$$;

grant execute on function public.app_update_section(text,uuid,text,text) to anon, authenticated;
