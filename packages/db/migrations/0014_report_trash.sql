-- Lixeira de relatórios: exclusão lógica, recuperável e compatível com linhas existentes.
alter table public.reports add column if not exists deleted_at timestamptz;
alter table public.reports add column if not exists deleted_by uuid references auth.users(id) on delete set null;

comment on column public.reports.deleted_at is 'Momento em que o relatório foi movido para a lixeira; null significa ativo.';
comment on column public.reports.deleted_by is 'Usuário que moveu o relatório para a lixeira.';

create index if not exists reports_deleted_at_created_at_idx
  on public.reports (deleted_at, created_at desc);
