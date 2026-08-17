-- Recuperação de senha por e-mail com token temporário de uso único.
-- Não remove nem altera registros existentes até que um paciente conclua a redefinição.

create table if not exists public.app_password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists app_password_reset_tokens_hash_idx
  on public.app_password_reset_tokens(token_hash);
create index if not exists app_password_reset_tokens_expiry_idx
  on public.app_password_reset_tokens(expires_at);

alter table public.app_password_reset_tokens enable row level security;

create or replace function public.app_create_password_reset(p_email text, p_token text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  u public.app_users;
  token_digest text;
begin
  select * into u
  from public.app_users
  where lower(app_users.email) = lower(trim(p_email))
    and app_users.role = 'patient';

  -- Resposta booleana apenas para uso interno do servidor. O endpoint externo
  -- mantém a mesma mensagem para e-mails existentes e inexistentes.
  if not found then return false; end if;

  token_digest := encode(digest(p_token, 'sha256'), 'hex');
  delete from public.app_password_reset_tokens
  where user_id = u.id or expires_at <= now();

  insert into public.app_password_reset_tokens(user_id, token_hash)
  values (u.id, token_digest);
  return true;
end;
$$;

create or replace function public.app_consume_password_reset(p_token text, p_password text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  reset_row public.app_password_reset_tokens;
  token_digest text;
begin
  if p_password is null or length(p_password) < 8 then return false; end if;
  token_digest := encode(digest(p_token, 'sha256'), 'hex');

  select * into reset_row
  from public.app_password_reset_tokens
  where token_hash = token_digest
    and used_at is null
    and expires_at > now()
  for update;

  if not found then return false; end if;

  update public.app_users
  set password_hash = crypt(p_password, gen_salt('bf')),
      is_first_access = false
  where id = reset_row.user_id
    and role = 'patient';

  if not found then return false; end if;

  update public.app_password_reset_tokens
  set used_at = now()
  where id = reset_row.id;

  delete from public.app_sessions where user_id = reset_row.user_id;
  return true;
end;
$$;

revoke all on table public.app_password_reset_tokens from anon, authenticated;
grant execute on function public.app_create_password_reset(text,text), public.app_consume_password_reset(text,text) to anon, authenticated;
