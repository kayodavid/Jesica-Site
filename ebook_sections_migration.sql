-- Seções independentes para eBooks
create table if not exists public.ebook_content_sections (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  cover_image text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ebook_content_sections enable row level security;
revoke all on public.ebook_content_sections from anon, authenticated;

create or replace function public.app_list_ebook_sections(p_token text)
returns setof public.ebook_content_sections
language plpgsql security definer set search_path = public
as $$
begin
  if exists (select 1 from public.app_sessions s join public.app_users u on u.id = s.user_id where s.token = p_token and s.expires_at > now()) then
    return query select * from public.ebook_content_sections order by lower(name);
  end if;
end;
$$;

create or replace function public.app_upsert_ebook_section(p_token text, p_name text, p_cover_image text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare clean_name text := trim(coalesce(p_name, ''));
begin
  if not exists (select 1 from public.app_sessions s join public.app_users u on u.id = s.user_id where s.token = p_token and s.expires_at > now() and u.role = 'admin') then
    return jsonb_build_object('success', false, 'message', 'Acesso não autorizado.');
  end if;
  if clean_name = '' then return jsonb_build_object('success', false, 'message', 'Informe o nome da seção.'); end if;
  insert into public.ebook_content_sections(name, cover_image) values (clean_name, coalesce(p_cover_image, ''))
  on conflict (name) do update set cover_image = case when coalesce(trim(excluded.cover_image), '') = '' then ebook_content_sections.cover_image else excluded.cover_image end, updated_at = now();
  return jsonb_build_object('success', true);
exception when others then return jsonb_build_object('success', false, 'message', sqlerrm);
end;
$$;

create or replace function public.app_update_ebook_section(p_token text, p_id uuid, p_name text, p_cover_image text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare old_name text; clean_name text := trim(coalesce(p_name, ''));
begin
  if not exists (select 1 from public.app_sessions s join public.app_users u on u.id = s.user_id where s.token = p_token and s.expires_at > now() and u.role = 'admin') then
    return jsonb_build_object('success', false, 'message', 'Acesso não autorizado.');
  end if;
  if clean_name = '' then return jsonb_build_object('success', false, 'message', 'Informe o nome da seção.'); end if;
  select name into old_name from public.ebook_content_sections where id = p_id;
  if old_name is null then return jsonb_build_object('success', false, 'message', 'Seção não encontrada.'); end if;
  if exists (select 1 from public.ebook_content_sections where lower(name) = lower(clean_name) and id <> p_id) then return jsonb_build_object('success', false, 'message', 'Já existe outra seção com esse nome.'); end if;
  update public.ebook_content_sections set name = clean_name, cover_image = case when coalesce(trim(p_cover_image), '') = '' then cover_image else p_cover_image end, updated_at = now() where id = p_id;
  update public.educational_ebooks set theme = clean_name where theme = old_name;
  return jsonb_build_object('success', true);
exception when others then return jsonb_build_object('success', false, 'message', sqlerrm);
end;
$$;

create or replace function public.app_delete_ebook_section(p_token text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare section_name text;
begin
  if not exists (select 1 from public.app_sessions s join public.app_users u on u.id = s.user_id where s.token = p_token and s.expires_at > now() and u.role = 'admin') then
    return jsonb_build_object('success', false, 'message', 'Acesso não autorizado.');
  end if;
  select name into section_name from public.ebook_content_sections where id = p_id;
  if section_name is null then return jsonb_build_object('success', false, 'message', 'Seção não encontrada.'); end if;
  if lower(section_name) = 'geral' then return jsonb_build_object('success', false, 'message', 'A seção Geral não pode ser excluída.'); end if;
  insert into public.ebook_content_sections(name) values ('Geral') on conflict (name) do nothing;
  update public.educational_ebooks set theme = 'Geral' where theme = section_name;
  delete from public.ebook_content_sections where id = p_id;
  return jsonb_build_object('success', true);
exception when others then return jsonb_build_object('success', false, 'message', sqlerrm);
end;
$$;

grant execute on function public.app_list_ebook_sections(text), public.app_upsert_ebook_section(text,text,text), public.app_update_ebook_section(text,uuid,text,text), public.app_delete_ebook_section(text,uuid) to anon, authenticated;

insert into public.ebook_content_sections(name, cover_image)
select distinct coalesce(nullif(trim(theme), ''), 'Geral'), '' from public.educational_ebooks
on conflict (name) do nothing;
insert into public.ebook_content_sections(name) values ('Geral') on conflict (name) do nothing;

-- As Seções antigas dos vídeos continuam em content_sections.
-- Os eBooks existentes são apenas espelhados para a nova tabela; nenhum conteúdo é apagado.

