-- 0005_photo_status.sql — estado de processamento das fotos (impl 007). Idempotente.
--
-- O pipeline de fotos (RF-15/RF-16) processa cada upload de forma assíncrona no
-- worker. A galeria precisa distinguir "processando" / "pronta" / "erro", então
-- adicionamos um estado explícito e a mensagem de erro recuperável (T-003).

alter table report_photos
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'done', 'error'));

alter table report_photos
  add column if not exists error_message text;

-- Apoia o polling da galeria por relatório+estado.
create index if not exists report_photos_status_idx
  on report_photos (report_id, status);
