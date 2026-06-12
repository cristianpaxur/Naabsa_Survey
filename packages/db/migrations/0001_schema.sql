-- 0001_schema.sql — enum report_status + tabelas do PRD §6.
-- Idempotente: seguro para re-rodar (create ... if not exists / guards).
-- Ordem respeita as dependências de FK. A FK report_types.active_spec_id é
-- adicionada na 0003 (dependência circular com report_specs).

-- gen_random_uuid() está disponível no Supabase (extensão pgcrypto).
create extension if not exists pgcrypto;

-- Enum de status do relatório (PRD §3.2).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'report_status') then
    create type report_status as enum
      ('draft','extracted','in_review','editing','approved','generated','purged');
  end if;
end
$$;

-- Tipos de relatório (5 no seed; PRD §3.1).
create table if not exists report_types (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,             -- draft_survey | bunker_surveyor | msc | on_off_hire | rob
  name text not null,
  variants text[] not null default '{}', -- vazio = sem variantes
  active_spec_id uuid                    -- FK adicionada na 0003 (após report_specs)
);

-- Specs versionados e imutáveis (PRD §8; imutabilidade na 0003).
create table if not exists report_specs (
  id uuid primary key default gen_random_uuid(),
  report_type_id uuid not null references report_types(id),
  version int not null,
  spec jsonb not null,                   -- contrato JSONB (PRD §8)
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (report_type_id, version)
);

-- Relatórios.
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  report_type_id uuid not null references report_types(id),
  spec_id uuid not null references report_specs(id),
  variant text,
  status report_status not null default 'draft',
  vessel_name text,                      -- denormalizado p/ dashboard (pós-extração)
  spreadsheet_path text,
  extracted_data jsonb,
  extraction_issues jsonb,               -- Issue[]
  operator_overrides jsonb not null default '{}',
  document_json jsonb,                   -- documento TipTap
  pdf_paths text[] not null default '{}',
  document_hash text,                    -- sha256 do document_json do último PDF
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  purged_at timestamptz
);

-- Fotos do relatório.
create table if not exists report_photos (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  original_path text not null,
  processed_path text,
  thumb_path text,
  slot_id text,                          -- null = não alocada
  position int not null default 0,
  crop jsonb,                            -- {x,y,width,height} relativo à processada
  quality_flags text[] not null default '{}',
  ai_suggested boolean not null default false,
  confirmed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Trilha de auditoria (PRD RF-32 / RNF-07).
create table if not exists audit_log (
  id bigint generated always as identity primary key,
  report_id uuid references reports(id) on delete set null,
  actor uuid references auth.users(id),  -- null = sistema/worker
  action text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

-- Papel do usuário (PRD RF-02).
create table if not exists profiles (
  user_id uuid primary key references auth.users(id),
  role text not null check (role in ('operator','admin')),
  display_name text not null
);

-- Índices de apoio ao dashboard e à auditoria.
create index if not exists reports_status_idx on reports (status);
create index if not exists reports_created_at_idx on reports (created_at desc);
create index if not exists reports_type_idx on reports (report_type_id);
create index if not exists report_photos_report_idx on report_photos (report_id);
create index if not exists audit_log_report_idx on audit_log (report_id, created_at);
