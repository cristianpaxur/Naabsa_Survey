-- 015/C05: autorização ativa e revogação transacional de sessões.
-- Aplicar antes do web atualizado. Não remove contas, relatórios nem auditoria.
alter table public.profiles add column if not exists access_revoked_at timestamptz;

create or replace function public.revoke_profile_sessions()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status is distinct from new.status or old.role is distinct from new.role then
    new.access_revoked_at := clock_timestamp();
    -- auth.sessions é a fonte do session_id do JWT; refresh tokens vinculados
    -- deixam de representar uma sessão válida. JWTs antigos são negados pela RLS.
    delete from auth.sessions where user_id = new.user_id;
  end if;
  return new;
end;
$$;
revoke all on function public.revoke_profile_sessions() from public, anon, authenticated;
drop trigger if exists profiles_revoke_sessions on public.profiles;
create trigger profiles_revoke_sessions before update of role, status on public.profiles
  for each row execute function public.revoke_profile_sessions();

create or replace function public.sync_user_access_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    update public.profiles set status = 'inactive' where user_id = old.linked_user_id;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.linked_user_id is distinct from new.linked_user_id then
    update public.profiles set status = 'inactive' where user_id = old.linked_user_id;
  end if;
  update public.profiles set role = new.role, status = new.status,
    display_name = new.display_name, email = new.email where user_id = new.linked_user_id;
  return new;
end;
$$;
revoke all on function public.sync_user_access_profile() from public, anon, authenticated;
drop trigger if exists user_access_sync_profile on public.user_access;
create trigger user_access_sync_profile after insert or update or delete on public.user_access
  for each row execute function public.sync_user_access_profile();

create or replace function public.current_has_role()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    join auth.sessions s on s.user_id = p.user_id
    where p.user_id = auth.uid() and p.status = 'active'
      and p.role in ('operator', 'admin')
      and s.id::text = (auth.jwt() ->> 'session_id')
      and (p.access_revoked_at is null or s.created_at > p.access_revoked_at)
  );
$$;
create or replace function public.current_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.current_has_role() and exists (
    select 1 from public.profiles where user_id = auth.uid() and role = 'admin'
  );
$$;

drop policy if exists report_types_select on public.report_types;
create policy report_types_select on public.report_types for select using (public.current_has_role());
drop policy if exists report_specs_select on public.report_specs;
create policy report_specs_select on public.report_specs for select using (public.current_has_role());

-- Não elimina a leitura do próprio profile: ela permite explicar acesso negado.
-- Acesso a documentos/relatórios depende de current_has_role em todas as políticas.
