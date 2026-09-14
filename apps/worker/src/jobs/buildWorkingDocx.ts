/** Montagem inicial idempotente. Objetos publicados nunca são sobrescritos. */
import { randomUUID } from 'node:crypto';
import { getServiceClient } from '../lib/supabase';
import { loadReport, buildWorkingDocx as assembleDocx } from './generatePdf';

export interface BuildWorkingDocxPayload {
  reportId: string;
  generation?: string;
}

export const BUILD_WORKING_DOCX_QUEUE = 'build_working_docx';
export const BUILD_WORKING_DOCX_CONCURRENCY = 1;
export const BUILD_WORKING_DOCX_RETRY_LIMIT = 2;

export async function buildWorkingDocx(payload: BuildWorkingDocxPayload): Promise<void> {
  const { reportId, generation } = payload;
  const svc = getServiceClient();
  const row = await loadReport(svc, reportId);
  if (!row) throw new Error(`[build_working_docx] relatório ${reportId} não encontrado.`);
  // Jobs legados sem geração não têm autoridade para reconstruir documentos.
  if (!generation || generation !== row.working_docx_generation || row.status !== 'editing' || row.working_docx_path) return;

  const { docx } = await assembleDocx(svc, reportId, row);
  const path = `${reportId}/working/${randomUUID()}.docx`;
  const up = await svc.storage.from('reports').upload(path, docx, {
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', upsert: false,
  });
  if (up.error) throw new Error(`[build_working_docx] falha no upload: ${up.error.message}`);

  // O job pode ter demorado: revalida geração, etapa e ausência de documento.
  // Em erro de resposta do banco não removemos o upload: o commit é ambíguo.
  const { error, count } = await svc.from('reports').update({
    working_docx_path: path, working_docx_revision: row.working_docx_revision + 1,
    working_docx_saved_at: new Date().toISOString(),
  } as never, { count: 'exact' }).eq('id', reportId).eq('status', 'editing')
    .eq('working_docx_generation', generation).eq('working_docx_revision', row.working_docx_revision)
    .is('working_docx_path', null);
  if (error) throw new Error(`[build_working_docx] falha ao publicar documento: ${error.message}`);
  if (count !== 1) return;
  await svc.from('audit_log').insert({ report_id: reportId, actor: null, action: 'working_docx_built',
    payload: { generation, path } } as never);
}
