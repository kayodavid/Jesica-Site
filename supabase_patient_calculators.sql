-- Calculadoras do Paciente: catálogo administrável e visível aos pacientes quando habilitado.
-- Tipos iniciais: IMC e relação cintura/estatura. Novos tipos podem ser incluídos futuramente.

create table if not exists public.patient_calculators (
  id uuid primary key default gen_random_uuid(),
  calculator_type text not null check (calculator_type in ('bmi', 'waist_height')),
  title text not null,
  description text not null default '',
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists patient_calculators_published_idx on public.patient_calculators(published, created_at desc);
alter table public.patient_calculators enable row level security;
revoke all on public.patient_calculators from anon, authenticated;

create or replace function public.app_list_patient_calculators(p_token text)
returns setof public.patient_calculators
language plpgsql security definer set search_path = public
as $f$
declare user_role text;
begin
  select u.role into user_role
  from public.app_sessions s
  join public.app_users u on u.id = s.user_id
  where s.token = p_token and s.expires_at > now();

  if user_role = 'admin' then
    return query select * from public.patient_calculators order by created_at desc;
  elsif user_role = 'patient' then
    return query select * from public.patient_calculators where published order by created_at desc;
  end if;
end;
$f$;

create or replace function public.app_add_patient_calculator(
  p_token text,
  p_calculator_type text,
  p_title text,
  p_description text,
  p_published boolean default true
)
returns jsonb
language plpgsql security definer set search_path = public
as $f$
declare calculator_id uuid;
begin
  if not exists (
    select 1 from public.app_sessions s join public.app_users u on u.id = s.user_id
    where s.token = p_token and s.expires_at > now() and u.role = 'admin'
  ) then
    return jsonb_build_object('success', false, 'message', 'Apenas administradores podem criar calculadoras.');
  end if;

  if trim(coalesce(p_title, '')) = '' then
    return jsonb_build_object('success', false, 'message', 'Informe o nome da calculadora.');
  end if;

  insert into public.patient_calculators (calculator_type, title, description, published)
  values (p_calculator_type, trim(p_title), trim(coalesce(p_description, '')), coalesce(p_published, true))
  returning id into calculator_id;

  return jsonb_build_object('success', true, 'id', calculator_id);
exception when check_violation then
  return jsonb_build_object('success', false, 'message', 'Tipo de calculadora inválido.');
end;
$f$;

create or replace function public.app_update_patient_calculator(
  p_token text,
  p_id uuid,
  p_calculator_type text,
  p_title text,
  p_description text,
  p_published boolean
)
returns jsonb
language plpgsql security definer set search_path = public
as $f$
begin
  if not exists (
    select 1 from public.app_sessions s join public.app_users u on u.id = s.user_id
    where s.token = p_token and s.expires_at > now() and u.role = 'admin'
  ) then
    return jsonb_build_object('success', false, 'message', 'Apenas administradores podem editar calculadoras.');
  end if;

  update public.patient_calculators
  set calculator_type = p_calculator_type,
      title = trim(p_title),
      description = trim(coalesce(p_description, '')),
      published = coalesce(p_published, false),
      updated_at = now()
  where id = p_id;

  if not found then
    return jsonb_build_object('success', false, 'message', 'Calculadora não encontrada.');
  end if;

  return jsonb_build_object('success', true);
exception when check_violation then
  return jsonb_build_object('success', false, 'message', 'Tipo de calculadora inválido.');
end;
$f$;

create or replace function public.app_delete_patient_calculator(p_token text, p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $f$
begin
  if not exists (
    select 1 from public.app_sessions s join public.app_users u on u.id = s.user_id
    where s.token = p_token and s.expires_at > now() and u.role = 'admin'
  ) then
    return jsonb_build_object('success', false, 'message', 'Apenas administradores podem excluir calculadoras.');
  end if;

  delete from public.patient_calculators where id = p_id;
  if not found then
    return jsonb_build_object('success', false, 'message', 'Calculadora não encontrada.');
  end if;

  return jsonb_build_object('success', true);
end;
$f$;

alter function public.app_list_patient_calculators(text) set row_security = off;
alter function public.app_add_patient_calculator(text,text,text,text,boolean) set row_security = off;
alter function public.app_update_patient_calculator(text,uuid,text,text,text,boolean) set row_security = off;
alter function public.app_delete_patient_calculator(text,uuid) set row_security = off;

grant execute on function public.app_list_patient_calculators(text), public.app_add_patient_calculator(text,text,text,text,boolean), public.app_update_patient_calculator(text,uuid,text,text,text,boolean), public.app_delete_patient_calculator(text,uuid) to anon, authenticated;

select 'patient calculators ready' as status;
