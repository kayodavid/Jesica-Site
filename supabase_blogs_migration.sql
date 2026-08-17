-- Blogs administráveis: blocos de texto e imagem
create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  excerpt text not null default '',
  content jsonb not null default '[]'::jsonb,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists blog_posts_published_idx on public.blog_posts(published, created_at desc);
alter table public.blog_posts enable row level security;

create or replace function public.app_list_blogs(p_token text)
returns setof public.blog_posts
language plpgsql security definer set search_path = public
as $$
declare r text;
begin
  select role into r from public.app_current_user(p_token);
  if r = 'admin' then
    return query select * from public.blog_posts order by created_at desc;
  elsif r = 'patient' or coalesce(p_token, '') = '' then
    return query select * from public.blog_posts where published order by created_at desc;
  end if;
end;
$$;

create or replace function public.app_add_blog(p_token text, p_title text, p_excerpt text, p_content jsonb, p_published boolean default true)
returns public.blog_posts
language plpgsql security definer set search_path = public
as $$
declare r text; item public.blog_posts;
begin
  select role into r from public.app_current_user(p_token);
  if r <> 'admin' then raise exception 'Acesso permitido somente ao administrador'; end if;
  insert into public.blog_posts(title, excerpt, content, published)
  values (trim(p_title), coalesce(trim(p_excerpt), ''), coalesce(p_content, '[]'::jsonb), coalesce(p_published, true))
  returning * into item;
  return item;
end;
$$;

create or replace function public.app_update_blog(p_token text, p_id uuid, p_title text, p_excerpt text, p_content jsonb, p_published boolean)
returns public.blog_posts
language plpgsql security definer set search_path = public
as $$
declare r text; item public.blog_posts;
begin
  select role into r from public.app_current_user(p_token);
  if r <> 'admin' then raise exception 'Acesso permitido somente ao administrador'; end if;
  update public.blog_posts
  set title=trim(p_title), excerpt=coalesce(trim(p_excerpt), ''), content=coalesce(p_content, '[]'::jsonb), published=coalesce(p_published, true), updated_at=now()
  where id=p_id
  returning * into item;
  return item;
end;
$$;

create or replace function public.app_delete_blog(p_token text, p_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare r text;
begin
  select role into r from public.app_current_user(p_token);
  if r <> 'admin' then raise exception 'Acesso permitido somente ao administrador'; end if;
  delete from public.blog_posts where id=p_id;
  return found;
end;
$$;

revoke all on public.blog_posts from anon, authenticated;
grant execute on function public.app_list_blogs(text), public.app_add_blog(text,text,text,jsonb,boolean), public.app_update_blog(text,uuid,text,text,jsonb,boolean), public.app_delete_blog(text,uuid) to anon, authenticated;
