-- Seções compartilhadas de vídeos e eBooks, com capa configurável pelo administrador
create table if not exists public.content_sections (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  cover_image text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.content_sections enable row level security;
revoke all on public.content_sections from anon, authenticated;

create or replace function public.app_list_sections(p_token text)
returns setof public.content_sections
language plpgsql security definer set search_path = public
as $$
begin
  if exists (select 1 from public.app_sessions s join public.app_users u on u.id = s.user_id where s.token = p_token and s.expires_at > now()) then
    return query select * from public.content_sections order by lower(name);
  end if;
end;
$$;

create or replace function public.app_upsert_section(p_token text, p_name text, p_cover_image text default '')
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare clean_name text := trim(coalesce(p_name, ''));
begin
  if not exists (select 1 from public.app_sessions s join public.app_users u on u.id = s.user_id where s.token = p_token and s.expires_at > now() and u.role = 'admin') then
    return jsonb_build_object('success', false, 'message', 'Acesso não autorizado.');
  end if;
  if clean_name = '' then return jsonb_build_object('success', false, 'message', 'Informe o nome da seção.'); end if;
  insert into public.content_sections(name, cover_image)
  values (clean_name, coalesce(p_cover_image, ''))
  on conflict (name) do update set cover_image = excluded.cover_image, updated_at = now();
  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.app_list_sections(text), public.app_upsert_section(text,text,text) to anon, authenticated;

insert into public.content_sections(name, cover_image)
select distinct theme, '' from public.educational_videos where trim(coalesce(theme, '')) <> ''
on conflict (name) do nothing;
insert into public.content_sections(name, cover_image)
select distinct theme, '' from public.educational_ebooks where trim(coalesce(theme, '')) <> ''
on conflict (name) do nothing;
insert into public.content_sections(name) values ('Geral') on conflict (name) do nothing;
