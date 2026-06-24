/**
 * Job `preview_pdf` — gera o PDF REAL do relatório (mesma lógica do generate_pdf)
 * para PRÉ-VISUALIZAÇÃO, sem checar status nem transicionar. Sobe em
 * `reports/{id}/preview.pdf`. Assim o preview do editor é idêntico ao download.
 *
 * Concorrência: 1 (LibreOffice). O mutex em lib/soffice.ts serializa com o
 * generate_pdf (perfil de macro compartilhado).
 */
import { getServiceClient } from '../lib/supabase';
import { loadReport, renderReportPdf } from './generatePdf';

export interface PreviewPdfPayload {
  reportId: string;
}

export const PREVIEW_PDF_QUEUE = 'preview_pdf';
export const PREVIEW_PDF_CONCURRENCY = 1;
export const PREVIEW_PDF_RETRY_LIMIT = 1;

const BUCKET = 'reports';

export async function previewPdf(payload: PreviewPdfPayload): Promise<void> {
  const { reportId } = payload;
  const svc = getServiceClient();

  const row = await loadReport(svc, reportId);
  if (!row) throw new Error(`[preview_pdf] relatório ${reportId} não encontrado.`);

  const { pdf } = await renderReportPdf(svc, reportId, row);
  const { error } = await svc.storage
    .from(BUCKET)
    .upload(`${reportId}/preview.pdf`, pdf, { contentType: 'application/pdf', upsert: true });
  if (error) throw new Error(`[preview_pdf] falha no upload do preview: ${error.message}`);

  console.log(`[preview_pdf] preview gerado para ${reportId}`);
}
