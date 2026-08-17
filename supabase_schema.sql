create extension if not exists pgcrypto;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  name text not null,
  role text not null check (role in ('admin','patient')),
  is_first_access boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.app_sessions (
  token text primary key default encode(gen_random_bytes(32), 'hex'),
  user_id uuid not null references public.app_users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

create table if not exists public.patient_calendars (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.app_users(id) on delete cascade,
  year integer not null,
  month integer not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique(patient_id, year, month)
);

create table if not exists public.educational_videos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  theme text not null default 'Geral',
  description text not null default '',
  url text not null,
  provider text not null check (provider in ('youtube','vimeo')),
  embed_url text not null,
  thumbnail_url text not null default '',
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_sessions_user_idx on public.app_sessions(user_id);
create index if not exists calendars_patient_idx on public.patient_calendars(patient_id);
create index if not exists videos_published_idx on public.educational_videos(published);

alter table public.app_users enable row level security;
alter table public.app_sessions enable row level security;
alter table public.patient_calendars enable row level security;
alter table public.educational_videos enable row level security;

drop function if exists public.app_login(text,text);
create or replace function public.app_login(p_email text, p_password text)
returns table(token text, user_id uuid, email text, name text, role text, is_first_access boolean)
language plpgsql security definer set search_path = public
as $$
declare u public.app_users;
begin
  select * into u from public.app_users where lower(app_users.email)=lower(p_email) and password_hash=crypt(p_password, password_hash);
  if not found then return; end if;
  delete from public.app_sessions where expires_at < now();
  return query insert into public.app_sessions(user_id) values (u.id) returning app_sessions.token, u.id, u.email, u.name, u.role, u.is_first_access;
end; $$;

drop function if exists public.app_current_user(text);
create or replace function public.app_current_user(p_token text)
returns table(user_id uuid, email text, name text, role text, is_first_access boolean)
language sql security definer set search_path = public
as $$
  select u.id, u.email, u.name, u.role, u.is_first_access
  from public.app_sessions s join public.app_users u on u.id=s.user_id
  where s.token=p_token and s.expires_at > now();
$$;

drop function if exists public.app_logout(text);
create or replace function public.app_logout(p_token text)
returns void language sql security definer set search_path = public as $$ delete from public.app_sessions where token=p_token; $$;

drop function if exists public.app_seed_admin(text,text,text);
create or replace function public.app_seed_admin(p_email text,p_password text,p_name text)
returns void language plpgsql security definer set search_path = public
as $$ begin
  insert into public.app_users(email,password_hash,name,role) values (lower(p_email),crypt(p_password,gen_salt('bf')),p_name,'admin')
  on conflict(email) do update set password_hash=excluded.password_hash,name=excluded.name,role='admin';
end; $$;

create or replace function public.app_list_videos(p_token text)
returns setof public.educational_videos language plpgsql security definer set search_path = public
as $$ declare r text; begin select role into r from public.app_current_user(p_token); if r='admin' then return query select * from public.educational_videos order by created_at desc; elsif r='patient' then return query select * from public.educational_videos where published order by created_at desc; end if; end; $$;

create or replace function public.app_list_patients(p_token text)
returns setof public.app_users language plpgsql security definer set search_path = public
as $$ begin if exists(select 1 from public.app_current_user(p_token) where role='admin') then return query select * from public.app_users where role='patient' order by created_at desc; end if; end; $$;

revoke all on all tables in schema public from anon, authenticated;
grant execute on function public.app_login(text,text), public.app_current_user(text), public.app_logout(text), public.app_seed_admin(text,text,text), public.app_list_videos(text), public.app_list_patients(text) to anon, authenticated;

select public.app_seed_admin('admin@jessicamelo.com.br','admin','Dra. Jessica Melo');
insert into public.educational_videos(title,theme,description,url,provider,embed_url,thumbnail_url)
select 'Vídeo educativo','Geral','Material disponibilizado pela Dra. Jessica Melo.','https://www.youtube.com/watch?v=wvIuRQbTQVM','youtube','https://www.youtube.com/embed/wvIuRQbTQVM','https://img.youtube.com/vi/wvIuRQbTQVM/hqdefault.jpg'
where not exists(select 1 from public.educational_videos);
