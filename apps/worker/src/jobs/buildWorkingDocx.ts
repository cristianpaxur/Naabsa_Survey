/**
 * Job `build_working_docx` (012/T-002) — monta o `working.docx` a partir dos dados
 * efetivos + planilha + fotos (reusa `buildWorkingDocx` do generate_pdf) e sobe em
 * `reports/{id}/working.docx`, gravando `working_docx_path`. É a 1ª etapa do editor:
 * roda ao entrar em `editing` (RF-001), antes de abrir o Collabora.
 *
 * Concorrência: 1 — usa LibreOffice (measureBookmarkPages) no 2-pass.
 */
import { getServiceClient } from '../lib/supabase';
import { loadReport, buildWorkingDocx as assembleDocx } from './generatePdf';

export interface BuildWorkingDocxPayload {
  reportId: string;
}

export const BUILD_WORKING_DOCX_QUEUE = 'build_working_docx';
export const BUILD_WORKING_DOCX_CONCURRENCY = 1;
export const BUILD_WORKING_DOCX_RETRY_LIMIT = 2;

const BUCKET = 'reports';

export async function buildWorkingDocx(payload: BuildWorkingDocxPayload): Promise<void> {
  const { reportId } = payload;
  const svc = getServiceClient();

  const row = await loadReport(svc, reportId);
  if (!row) throw new Error(`[build_working_docx] relatório ${reportId} não encontrado.`);

  const { docx } = await assembleDocx(svc, reportId, row);
  const path = `${reportId}/working.docx`;
  const up = await svc.storage.from(BUCKET).upload(path, docx, {
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    upsert: true,
  });
  if (up.error) throw new Error(`[build_working_docx] falha no upload: ${up.error.message}`);

  const { error } = await svc
    .from('reports')
    .update({ working_docx_path: path } as never)
    .eq('id', reportId);
  if (error) throw new Error(`[build_working_docx] falha ao gravar working_docx_path: ${error.message}`);

  console.log(`[build_working_docx] working.docx montado para ${reportId}`);
}
