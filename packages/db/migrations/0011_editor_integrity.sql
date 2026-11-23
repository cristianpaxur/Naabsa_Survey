-- C02/C03: objetos DOCX imutáveis e troca atômica do ponteiro.
-- Aplicar antes de publicar web/worker; nenhum arquivo existente é removido.
alter table public.reports
  add column if not exists working_docx_generation uuid not null default gen_random_uuid(),
  add column if not exists working_docx_revision integer not null default 0,
  add column if not exists working_docx_saved_at timestamptz,
  add column if not exists approved_docx_path text,
  add column if not exists approved_docx_revision integer;

comment on column public.reports.working_docx_path is
  'Objeto DOCX imutável publicado por CAS; legado {id}/working.docx ou {id}/working/{uuid}.docx.';
comment on column public.reports.approved_docx_path is
  'Snapshot imutável da aprovação; conversão PDF usa exatamente estes bytes.';

-- O caminho legado já é a referência persistida dos relatórios existentes.
update public.reports
set approved_docx_path = working_docx_path,
    approved_docx_revision = working_docx_revision
where status in ('approved', 'generated') and approved_docx_path is null
  and working_docx_path is not null;

create or replace function public.reset_working_document_generation()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'draft' and old.status <> 'draft' then
    new.working_docx_generation := gen_random_uuid();
    new.working_docx_path := null;
    new.working_docx_saved_at := null;
    new.approved_docx_path := null;
    new.approved_docx_revision := null;
    -- A revisão nunca volta a zero: recibos antigos não autorizam outro ciclo.
    new.working_docx_revision := old.working_docx_revision + 1;
  end if;
  return new;
end;
$$;
drop trigger if exists reports_reset_working_document on public.reports;
create trigger reports_reset_working_document before update of status on public.reports
for each row execute function public.reset_working_document_generation();
