-- Configuração administrativa da ordem de exibição da biblioteca do paciente
create table if not exists public.content_display_settings (
  id boolean primary key default true check (id = true),
  video_section_order text not null default 'recent',
  video_content_order text not null default 'recent',
  ebook_section_order text not null default 'recent',
  ebook_content_order text not null default 'recent',
  updated_at timestamptz not null default now()
);

insert into public.content_display_settings (id)
values (true)
on conflict (id) do nothing;

alter table public.content_display_settings enable row level security;

create or replace function public.app_get_content_order_settings(p_token text)
returns table(video_section_order text, video_content_order text, ebook_section_order text, ebook_content_order text)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.app_sessions where token = p_token and expires_at > now()) then return; end if;
  return query select s.video_section_order, s.video_content_order, s.ebook_section_order, s.ebook_content_order
  from public.content_display_settings s where s.id = true;
end;
$$;

create or replace function public.app_update_content_order_settings(
  p_token text,
  p_video_section_order text,
  p_video_content_order text,
  p_ebook_section_order text,
  p_ebook_content_order text
)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.app_sessions s join public.app_users u on u.id = s.user_id where s.token = p_token and s.expires_at > now() and u.role = 'admin') then
    return jsonb_build_object('success', false, 'message', 'Acesso administrativo necessário.');
  end if;
  if p_video_section_order not in ('alpha','recent') or p_video_content_order not in ('alpha','recent') or p_ebook_section_order not in ('alpha','recent') or p_ebook_content_order not in ('alpha','recent') then
    return jsonb_build_object('success', false, 'message', 'Opção de ordenação inválida.');
  end if;
  update public.content_display_settings set video_section_order = p_video_section_order, video_content_order = p_video_content_order, ebook_section_order = p_ebook_section_order, ebook_content_order = p_ebook_content_order, updated_at = now() where id = true;
  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.app_get_content_order_settings(text), public.app_update_content_order_settings(text,text,text,text,text) to anon, authenticated;
select 'content order settings ready' as status;
