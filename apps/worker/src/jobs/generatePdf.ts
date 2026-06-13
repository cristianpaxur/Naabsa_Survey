/**
 * Job `generate_pdf` — implementação 004/T-008.
 *
 * Fluxo:
 *  1. Valida que o relatório está em `approved`.
 *  2. Abre /reports/[id]/print?token= no Chromium singleton.
 *  3. Gera PDF A4 com `page.pdf()`.
 *  4. Faz upload para Storage `reports/{id}/final.pdf`.
 *  5. Grava sha256 do `document_json`, transiciona para `generated`, audita.
 *
 * Concorrência: 1 (RNF-04) — configurada no registro do job em index.ts.
 * Timeout: 60 s (RNF-004) — configurado na chamada page.goto e waitForLoadState.
 */

import { createHash } from 'crypto';
import { getBrowser } from '../lib/browser';
import { getServiceClient } from '../lib/supabase';
import { requireEnv } from '../lib/env';

export interface GeneratePdfPayload {
  reportId: string;
}

/** Nome da fila (espelhado no web e no index.ts). */
export const GENERATE_PDF_QUEUE = 'generate_pdf';
export const GENERATE_PDF_CONCURRENCY = 1;
export const GENERATE_PDF_RETRY_LIMIT = 2;
export const GENERATE_PDF_TIMEOUT_S = 60;

export async function generatePdf(data: GeneratePdfPayload): Promise<void> {
  const { reportId } = data;
  const svc = getServiceClient();

  // ── 1. Verificar estado do relatório ────────────────────────────────────
  const { data: report, error: fetchErr } = await svc
    .from('reports')
    .select('status, document_json, created_by')
    .eq('id', reportId)
    .single();

  if (fetchErr || !report) {
    throw new Error(`[generate_pdf] relatório ${reportId} não encontrado.`);
  }
  if (report.status !== 'approved') {
    // Auditar e sair sem erro (não é retry-ável — estado errado).
    await auditLog(svc, reportId, null, 'pdf_rejected', {
      reason: `status inválido: ${report.status as string} (esperado approved)`,
    });
    return;
  }
  if (!report.document_json) {
    throw new Error(`[generate_pdf] relatório ${reportId} sem document_json.`);
  }

  // ── 2. Hash do document_json ─────────────────────────────────────────────
  const docHash = createHash('sha256')
    .update(JSON.stringify(report.document_json))
    .digest('hex');

  // ── 3. Render via Playwright ─────────────────────────────────────────────
  const appBaseUrl = requireEnv('APP_BASE_URL');
  const printToken = requireEnv('PRINT_SERVICE_TOKEN');
  const printUrl = `${appBaseUrl}/reports/${reportId}/print?token=${printToken}`;

  const browser = await getBrowser();
  const page = await browser.newPage();
  let pdfBuffer: Buffer;

  try {
    await page.goto(printUrl, {
      waitUntil: 'networkidle',
      timeout: GENERATE_PDF_TIMEOUT_S * 1000,
    });

    // Verificar se a página não retornou erro (401/404 ficam como conteúdo HTML)
    const bodyText = await page.locator('body').innerText();
    if (bodyText.includes('Não autorizado') || bodyText.includes('não encontrado')) {
      throw new Error(`[generate_pdf] rota /print retornou erro: ${bodyText.slice(0, 120)}`);
    }

    pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', right: '20mm', bottom: '28mm', left: '20mm' },
    });
  } finally {
    await page.close();
  }

  // ── 4. Upload do PDF para o Storage ─────────────────────────────────────
  const storagePath = `${reportId}/final.pdf`;
  const { error: uploadErr } = await svc.storage
    .from('reports')
    .upload(storagePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadErr) {
    throw new Error(`[generate_pdf] falha no upload do PDF: ${uploadErr.message}`);
  }

  // ── 5. Atualizar relatório e auditar ─────────────────────────────────────
  const now = new Date().toISOString();
  const { error: updateErr } = await svc
    .from('reports')
    .update({
      status: 'generated',
      document_hash: docHash,
      pdf_paths: [storagePath],
      generated_at: now,
    } as never)
    .eq('id', reportId)
    .eq('status', 'approved'); // guarda corrida

  if (updateErr) {
    throw new Error(`[generate_pdf] falha ao atualizar relatório: ${updateErr.message}`);
  }

  const userId = report.created_by as string | null;
  await auditLog(svc, reportId, userId, 'pdf_generated', {
    document_hash: docHash,
    storage_path: storagePath,
  });

  console.log(`[generate_pdf] PDF gerado para relatório ${reportId} (hash ${docHash.slice(0, 8)}…)`);
}

async function auditLog(
  svc: ReturnType<typeof getServiceClient>,
  reportId: string,
  userId: string | null,
  action: string,
  details?: Record<string, unknown>,
): Promise<void> {
  await svc.from('audit_log').insert({
    report_id: reportId,
    user_id: userId,
    action,
    details: details ?? null,
  } as never);
}
