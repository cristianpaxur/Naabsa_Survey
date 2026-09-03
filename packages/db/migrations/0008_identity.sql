-- 0008_identity.sql — cadastro e ciclo de vida de acessos (implementação 013).

alter table public.profiles
  add column if not exists status text not null default 'active',
  add column if not exists last_login_at timestamptz,
  add column if not exists email text,
  add column if not exists auth_provider text not null default 'password';

do $$ begin
  alter table public.profiles add constraint profiles_status_check
    check (status in ('active', 'inactive', 'pending'));
exception when duplicate_object then null;
end $$;

create table if not exists public.user_access (
  email text primary key check (email = lower(trim(email))),
  display_name text not null,
  role text not null check (role in ('operator', 'admin')),
  status text not null default 'active' check (status in ('active', 'inactive', 'pending')),
  invited_by uuid references auth.users(id),
  linked_user_id uuid unique references auth.users(id) on delete set null,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Preserva os usuários já provisionados pelos seeds anteriores.
insert into public.user_access (email, display_name, role, status, linked_user_id)
select lower(u.email), p.display_name, p.role, p.status, p.user_id
from public.profiles p
join auth.users u on u.id = p.user_id
where u.email is not null
on conflict (email) do nothing;

update public.profiles p
set email = lower(u.email)
from auth.users u
where u.id = p.user_id and p.email is null;

alter table public.user_access enable row level security;

drop policy if exists user_access_select on public.user_access;
create policy user_access_select on public.user_access
  for select using (public.current_is_admin());

drop policy if exists user_access_insert on public.user_access;
create policy user_access_insert on public.user_access
  for insert with check (public.current_is_admin());

drop policy if exists user_access_update on public.user_access;
create policy user_access_update on public.user_access
  for update using (public.current_is_admin()) with check (public.current_is_admin());

drop policy if exists user_access_delete on public.user_access;
create policy user_access_delete on public.user_access
  for delete using (public.current_is_admin());

create index if not exists user_access_status_role_idx
  on public.user_access (status, role);

