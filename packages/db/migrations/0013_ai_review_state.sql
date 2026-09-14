-- Estado e versão da revisão por IA. Não modifica specs nem dados extraídos.
alter table public.reports add column if not exists data_revision bigint not null default 0;
alter table public.reports add column if not exists ai_review jsonb;

create or replace function public.track_review_data_revision()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.extracted_data is distinct from old.extracted_data
    or new.operator_overrides is distinct from old.operator_overrides
    or new.spec_id is distinct from old.spec_id
    or new.variant is distinct from old.variant
    or (new.status = 'draft' and old.status <> 'draft') then
    new.data_revision := old.data_revision + 1;
    if new.extracted_data is distinct from old.extracted_data
      or new.spec_id is distinct from old.spec_id
      or new.variant is distinct from old.variant
      or new.status = 'draft' then
      new.ai_review := null;
      select coalesce(jsonb_agg(issue), '[]'::jsonb) into new.extraction_issues
        from jsonb_array_elements(coalesce(new.extraction_issues, '[]'::jsonb)) issue
        where issue->>'origin' is distinct from 'ai';
    elsif new.ai_review is not null then
      -- Mantém o snapshot: avisos sobre campos inalterados continuam consultáveis.
      new.ai_review := new.ai_review || jsonb_build_object('status', 'stale');
    end if;
  else
    new.data_revision := old.data_revision;
  end if;
  return new;
end;
$$;
drop trigger if exists reports_review_revision on public.reports;
create trigger reports_review_revision before update on public.reports
  for each row execute function public.track_review_data_revision();

create table if not exists public.worker_heartbeats (
  id text primary key,
  seen_at timestamptz not null default now(),
  ai_enabled boolean not null,
  ai_provider text not null,
  ai_model text not null,
  queue_ready boolean not null
);
alter table public.worker_heartbeats enable row level security;
revoke all on public.worker_heartbeats from anon, authenticated;
grant select on public.worker_heartbeats to authenticated;
grant all on public.worker_heartbeats to service_role;
drop policy if exists worker_heartbeats_admin on public.worker_heartbeats;
create policy worker_heartbeats_admin on public.worker_heartbeats for select
  to authenticated using (public.current_is_admin());
