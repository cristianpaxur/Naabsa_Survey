-- 0003_constraints.sql — imutabilidade de report_specs + FK circular. Idempotente.

-- ── Imutabilidade de report_specs (RF-35) — defesa dupla ──
-- A 0002 já nega UPDATE para usuários autenticados (sem política de update).
-- O trigger abaixo bloqueia o UPDATE também para o service role (que ignora RLS).
create or replace function public.forbid_report_specs_update()
returns trigger
language plpgsql
as $$
begin
  raise exception 'report_specs é imutável: updates não são permitidos (RF-35).';
end;
$$;

drop trigger if exists report_specs_no_update on report_specs;
create trigger report_specs_no_update
  before update on report_specs
  for each row execute function public.forbid_report_specs_update();

-- ── FK report_types.active_spec_id → report_specs.id ──
-- Adicionada aqui por causa da dependência circular entre as duas tabelas (PRD §6).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'report_types_active_spec_id_fkey'
  ) then
    alter table report_types
      add constraint report_types_active_spec_id_fkey
      foreign key (active_spec_id) references report_specs(id);
  end if;
end
$$;
