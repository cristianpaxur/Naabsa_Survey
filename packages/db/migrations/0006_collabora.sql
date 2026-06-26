-- 011: Editor nativo Collabora Online (WOPI host).
-- Colunas de suporte ao `working.docx` editável e ao lock WOPI.
-- Aditiva e idempotente (não altera dados existentes).

alter table reports add column if not exists working_docx_path text;
alter table reports add column if not exists wopi_lock text;
alter table reports add column if not exists wopi_lock_expires_at timestamptz;

comment on column reports.working_docx_path is
  'Caminho no Storage do .docx editável aberto no Collabora (impl. 011/012). Convenção {id}/working.docx.';
comment on column reports.wopi_lock is
  'Lock WOPI corrente (string opaca do Collabora) ou null (impl. 011).';
comment on column reports.wopi_lock_expires_at is
  'Expiração do lock WOPI; renovado por RefreshLock (impl. 011).';
