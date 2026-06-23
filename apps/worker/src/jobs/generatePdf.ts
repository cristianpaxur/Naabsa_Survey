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

/** Cache do logo NAABSA em data-uri (buscado uma vez do app). */
let logoDataUriCache: string | null = null;

async function getLogoDataUri(appBaseUrl: string): Promise<string> {
  if (logoDataUriCache !== null) return logoDataUriCache;
  try {
    const res = await fetch(`${appBaseUrl}/naabsa-logo.jpg`);
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      logoDataUriCache = `data:image/jpeg;base64,${buf.toString('base64')}`;
      return logoDataUriCache;
    }
  } catch {
    /* segue sem logo */
  }
  logoDataUriCache = '';
  return logoDataUriCache;
}

/** Cabeçalho por página (logo + tagline), espelha o modelo Word. */
function headerTemplate(logoDataUri: string): string {
  const logo = logoDataUri
    ? `<img src="${logoDataUri}" style="height:9mm;width:auto;" />`
    : '<span style="font-weight:800;font-size:16pt;color:#bf2c30;">NAABSA</span>';
  return `<div style="width:100%;font-family:'Calibri','Carlito',sans-serif;color:#002060;
      padding:5mm 18mm 0 18mm;box-sizing:border-box;-webkit-print-color-adjust:exact;">
    <div style="display:flex;align-items:flex-end;justify-content:space-between;
        border-bottom:0.75pt solid #002060;padding-bottom:2pt;">
      ${logo}
      <div style="text-align:right;font-family:Georgia,'Times New Roman',serif;">
        <div style="font-size:12pt;font-weight:700;line-height:1.1;">MARINE SURVEYORS &amp; CONSULTANTS</div>
        <div style="font-size:8pt;">Main Brazilian Ports</div>
      </div>
    </div>
  </div>`;
}

/** Rodapé por página (e-mail | url + número de página). */
const FOOTER_TEMPLATE = `<div style="width:100%;font-family:'Calibri','Carlito',sans-serif;
    color:#7f7f7f;font-size:8pt;padding:0 18mm;box-sizing:border-box;text-align:right;">
  surveyors@naabsa.com.br &nbsp;|&nbsp; www.naabsa.com &nbsp;&nbsp;&nbsp;&nbsp; <span class="pageNumber"></span>
</div>`;

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

    // Cabeçalho/rodapé repetidos em TODAS as páginas (como o modelo Word).
    const logoDataUri = await getLogoDataUri(appBaseUrl);
    pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: headerTemplate(logoDataUri),
      footerTemplate: FOOTER_TEMPLATE,
      margin: { top: '30mm', right: '18mm', bottom: '18mm', left: '18mm' },
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
  // Colunas reais de `reports` (migration 0001): status, document_hash,
  // pdf_paths. NÃO existe `generated_at` — o carimbo de tempo fica no audit_log.
  const { error: updateErr } = await svc
    .from('reports')
    .update({
      status: 'generated',
      document_hash: docHash,
      pdf_paths: [storagePath],
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
  // Colunas reais do audit_log (migration 0001): actor + payload.
  await svc.from('audit_log').insert({
    report_id: reportId,
    actor: userId,
    action,
    payload: details ?? null,
  } as never);
}
