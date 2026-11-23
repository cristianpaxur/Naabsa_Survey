-- Precisão decimal observada na extração e escolhida pelo operador.
-- Os defaults preservam relatórios existentes e o formato de objeto evita
-- estados ambíguos para os consumidores.
set local lock_timeout = '5s';

alter table public.reports
  add column if not exists extracted_number_formats jsonb not null default '{}'::jsonb,
  add column if not exists operator_number_formats jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reports_extracted_number_formats_object'
      and conrelid = 'public.reports'::regclass
  ) then
    alter table public.reports
      add constraint reports_extracted_number_formats_object
      check (jsonb_typeof(extracted_number_formats) = 'object') not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'reports_operator_number_formats_object'
      and conrelid = 'public.reports'::regclass
  ) then
    alter table public.reports
      add constraint reports_operator_number_formats_object
      check (jsonb_typeof(operator_number_formats) = 'object') not valid;
  end if;
end
$$;

alter table public.reports
  validate constraint reports_extracted_number_formats_object;
alter table public.reports
  validate constraint reports_operator_number_formats_object;

create or replace function public.track_review_data_revision()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.extracted_data is distinct from old.extracted_data
    or new.extracted_number_formats is distinct from old.extracted_number_formats
    or new.operator_overrides is distinct from old.operator_overrides
    or new.operator_number_formats is distinct from old.operator_number_formats
    or new.spec_id is distinct from old.spec_id
    or new.variant is distinct from old.variant
    or (new.status = 'draft' and old.status <> 'draft') then
    new.data_revision := old.data_revision + 1;
    if new.extracted_data is distinct from old.extracted_data
      or new.extracted_number_formats is distinct from old.extracted_number_formats
      or new.spec_id is distinct from old.spec_id
      or new.variant is distinct from old.variant
      or new.status = 'draft' then
      new.ai_review := null;
      select coalesce(jsonb_agg(issue), '[]'::jsonb) into new.extraction_issues
        from jsonb_array_elements(coalesce(new.extraction_issues, '[]'::jsonb)) issue
        where issue->>'origin' is distinct from 'ai';
    elsif new.ai_review is not null then
      -- Edições manuais mantêm o snapshot consultável, mas obsoleto.
      new.ai_review := new.ai_review || jsonb_build_object('status', 'stale');
    end if;
  else
    new.data_revision := old.data_revision;
  end if;
  return new;
end;
$$;
