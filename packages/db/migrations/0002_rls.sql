-- 0002_rls.sql — Row Level Security em TODAS as tabelas (PRD §6 RLS / RNF-05).
-- O service role (worker) ignora RLS (bypassrls) — políticas valem para
-- usuários autenticados via anon key + sessão. Idempotente (drop policy if exists).

-- ── Helpers de papel (SECURITY DEFINER para ler profiles sem recursão de RLS) ──
create or replace function public.current_has_role()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p where p.user_id = auth.uid()
  );
$$;

create or replace function public.current_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  );
$$;

-- ── Habilitar RLS ──
alter table profiles      enable row level security;
alter table report_types  enable row level security;
alter table report_specs  enable row level security;
alter table reports       enable row level security;
alter table report_photos enable row level security;
alter table audit_log     enable row level security;

-- ── profiles: legível pelo próprio usuário e por admin; escrita só admin ──
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles
  for select using (user_id = auth.uid() or public.current_is_admin());

drop policy if exists profiles_insert on profiles;
create policy profiles_insert on profiles
  for insert with check (public.current_is_admin());

drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles
  for update using (public.current_is_admin()) with check (public.current_is_admin());

drop policy if exists profiles_delete on profiles;
create policy profiles_delete on profiles
  for delete using (public.current_is_admin());

-- ── report_types: leitura p/ autenticados; escrita só admin ──
drop policy if exists report_types_select on report_types;
create policy report_types_select on report_types
  for select using (auth.uid() is not null);

drop policy if exists report_types_insert on report_types;
create policy report_types_insert on report_types
  for insert with check (public.current_is_admin());

drop policy if exists report_types_update on report_types;
create policy report_types_update on report_types
  for update using (public.current_is_admin()) with check (public.current_is_admin());

-- ── report_specs: leitura p/ autenticados; insert só admin; UPDATE proibido (0003) ──
drop policy if exists report_specs_select on report_specs;
create policy report_specs_select on report_specs
  for select using (auth.uid() is not null);

drop policy if exists report_specs_insert on report_specs;
create policy report_specs_insert on report_specs
  for insert with check (public.current_is_admin());
-- (sem política de UPDATE/DELETE → negado p/ autenticados; trigger na 0003 cobre o service role)

-- ── reports: acessível a usuários autenticados COM papel ──
drop policy if exists reports_select on reports;
create policy reports_select on reports
  for select using (public.current_has_role());

drop policy if exists reports_insert on reports;
create policy reports_insert on reports
  for insert with check (public.current_has_role());

drop policy if exists reports_update on reports;
create policy reports_update on reports
  for update using (public.current_has_role()) with check (public.current_has_role());

-- ── report_photos: acessível a usuários autenticados COM papel ──
drop policy if exists report_photos_select on report_photos;
create policy report_photos_select on report_photos
  for select using (public.current_has_role());

drop policy if exists report_photos_insert on report_photos;
create policy report_photos_insert on report_photos
  for insert with check (public.current_has_role());

drop policy if exists report_photos_update on report_photos;
create policy report_photos_update on report_photos
  for update using (public.current_has_role()) with check (public.current_has_role());

drop policy if exists report_photos_delete on report_photos;
create policy report_photos_delete on report_photos
  for delete using (public.current_has_role());

-- ── audit_log: append-only; leitura/insert p/ usuários com papel (sem update/delete) ──
drop policy if exists audit_log_select on audit_log;
create policy audit_log_select on audit_log
  for select using (public.current_has_role());

drop policy if exists audit_log_insert on audit_log;
create policy audit_log_insert on audit_log
  for insert with check (public.current_has_role());
