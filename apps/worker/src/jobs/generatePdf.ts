/**
 * Job `generate_pdf` — gera o relatório como .docx NATIVO (reproduz o modelo Word
 * do cliente) e converte para PDF via LibreOffice. Substitui o render HTML→PDF.
 *
 * Fluxo:
 *  1. Valida que o relatório está em `approved`.
 *  2. Resolve dados efetivos (extracted_data + operator_overrides), variante e spec.
 *  3. Baixa planilha (tabelas/figures), prints das abas (render_sheets) e fotos por slot.
 *  4. Monta o .docx em 2 passes (mede páginas → sumário com nº reais) e converte → PDF.
 *  5. Sobe `reports/{id}/final.pdf` (+ `final.docx`), grava hash, transiciona → `generated`.
 *
 * Concorrência: 1 (RNF-04) — LibreOffice é pesado, registrada em index.ts.
 */
import { createHash } from 'crypto';
import ExcelJS from 'exceljs';
import sharp from 'sharp';
import {
  runExtraction, collectFields, resolveFieldValue, resolveVariant,
  type ReportSpec, type FieldValue,
} from '@naabsa/core';
import { getServiceClient } from '../lib/supabase';
import { requireEnv } from '../lib/env';
import { buildReportDocx, type DocxInput } from '../lib/buildDocx';
import { convertDocxToPdf, measureBookmarkPages } from '../lib/soffice';

export interface GeneratePdfPayload {
  reportId: string;
}

export const GENERATE_PDF_QUEUE = 'generate_pdf';
export const GENERATE_PDF_CONCURRENCY = 1;
export const GENERATE_PDF_RETRY_LIMIT = 2;
// Orçamento total (.docx 2-pass + LibreOffice). Os limites duros por etapa ficam
// em lib/soffice.ts (medição 90s, conversão 120s) — eles matam processos travados.
export const GENERATE_PDF_TIMEOUT_S = 300;

const BUCKET = 'reports';

/** Logo NAABSA (data do app), cacheado. Null se indisponível (header cai em texto). */
let logoCache: Buffer | null | undefined;
async function fetchLogo(): Promise<Buffer | null> {
  if (logoCache !== undefined) return logoCache;
  try {
    const res = await fetch(`${requireEnv('APP_BASE_URL')}/naabsa-logo.jpg`);
    logoCache = res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  } catch {
    logoCache = null;
  }
  return logoCache;
}

/** Valores efetivos (extracted + overrides) — espelha apps/web/lib/document-assembly.ts. */
function effectiveData(
  spec: ReportSpec,
  variant: string | null,
  extracted: Record<string, FieldValue>,
  overrides: Record<string, FieldValue> | null,
): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  for (const [name] of collectFields(spec, variant)) {
    out[name] = resolveFieldValue(name, overrides ?? {}, extracted);
  }
  return out;
}

const toStr = (m: unknown): string[][] =>
  Array.isArray(m) ? (m as unknown[][]).map((r) => r.map((c) => (c == null ? '' : String(c)))) : [];

interface Crop { x: number; y: number; width: number; height: number }
/** Aplica o crop (normalizado 0-1, relativo à imagem processada) via sharp. */
async function applyCrop(buf: Buffer, crop: Crop | null): Promise<Buffer> {
  if (!crop) return buf;
  try {
    const meta = await sharp(buf).metadata();
    const W = meta.width ?? 0, H = meta.height ?? 0;
    if (!W || !H) return buf;
    const left = Math.max(0, Math.min(W - 1, Math.round(crop.x * W)));
    const top = Math.max(0, Math.min(H - 1, Math.round(crop.y * H)));
    const width = Math.max(1, Math.min(W - left, Math.round(crop.width * W)));
    const height = Math.max(1, Math.min(H - top, Math.round(crop.height * H)));
    return await sharp(buf).extract({ left, top, width, height }).toBuffer();
  } catch {
    return buf; // crop inválido → usa imagem inteira
  }
}

async function download(svc: ReturnType<typeof getServiceClient>, path: string) {
  const { data, error } = await svc.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

export interface ReportRow {
  status: string;
  variant: string | null;
  spec_id: string;
  extracted_data: unknown;
  operator_overrides: unknown;
  spreadsheet_path: string | null;
  created_by: string | null;
  pdf_paths: string[] | null;
}

export async function loadReport(svc: ReturnType<typeof getServiceClient>, reportId: string): Promise<ReportRow | null> {
  const { data, error } = await svc
    .from('reports')
    .select('status, variant, spec_id, extracted_data, operator_overrides, spreadsheet_path, created_by, pdf_paths')
    .eq('id', reportId)
    .single();
  if (error || !data) return null;
  return data as unknown as ReportRow;
}

/** Próxima versão do PDF a partir dos caminhos existentes (final-v{n}.pdf). */
function nextPdfVersion(paths: string[]): number {
  let max = 0;
  for (const p of paths) {
    const m = /final-v(\d+)\.pdf$/.exec(p);
    if (m) max = Math.max(max, parseInt(m[1]!, 10));
  }
  return max + 1;
}

/**
 * Núcleo de geração (compartilhado por generate_pdf e preview_pdf): carrega
 * dados/planilha/imagens/fotos, monta o .docx (2 passes) e converte → PDF.
 * NÃO checa status nem transiciona — quem chama decide o que fazer com o PDF.
 */
export async function renderReportPdf(
  svc: ReturnType<typeof getServiceClient>,
  reportId: string,
  row: ReportRow,
): Promise<{ pdf: Buffer; docx: Buffer; docHash: string }> {
  // Spec congelado.
  const { data: specRow } = await svc.from('report_specs').select('spec').eq('id', row.spec_id).single();
  const spec = (specRow as { spec: ReportSpec } | null)?.spec;
  if (!spec) throw new Error(`[generate_pdf] spec ${row.spec_id} não encontrado.`);

  // Planilha → variante AUTORITATIVA (spec resolve de Capa!L4) + tabelas (figures).
  let wb: ExcelJS.Workbook | null = null;
  if (row.spreadsheet_path) {
    const xlsx = await download(svc, row.spreadsheet_path);
    if (xlsx) {
      wb = new ExcelJS.Workbook();
      // cast p/ o tipo exato esperado (conflito de versões de Buffer entre @types/node).
      await wb.xlsx.load(xlsx as unknown as Parameters<typeof wb.xlsx.load>[0]);
    }
  }
  const variant = (wb ? resolveVariant(wb, spec).variant : null) ?? row.variant;
  const variantStr: 'loading' | 'discharge' = variant === 'discharge' ? 'discharge' : 'loading';
  const extracted = (row.extracted_data ?? {}) as unknown as Record<string, FieldValue>;
  const overrides = (row.operator_overrides ?? {}) as unknown as Record<string, FieldValue>;
  const data = effectiveData(spec, variant, extracted, overrides);
  const tables: Record<string, FieldValue[][]> = wb ? runExtraction(wb, spec, variant).tables : {};

  // Prints das abas (render_sheets) + fotos por slot (com crop).
  const sheetImages = {
    initial: await download(svc, `${reportId}/sheets/initial.png`),
    intermediate: await download(svc, `${reportId}/sheets/intermediate.png`),
    final: await download(svc, `${reportId}/sheets/final.png`),
  };
  const { data: photoRows } = await svc
    .from('report_photos')
    .select('slot_id, processed_path, position, crop')
    .eq('report_id', reportId)
    .not('slot_id', 'is', null)
    .order('position', { ascending: true });
  const bySlot: Record<string, Buffer[]> = {};
  for (const r of (photoRows ?? []) as { slot_id: string | null; processed_path: string | null; crop: Crop | null }[]) {
    if (!r.slot_id || !r.processed_path) continue;
    const buf = await download(svc, r.processed_path);
    if (buf) (bySlot[r.slot_id] ??= []).push(await applyCrop(buf, r.crop));
  }

  // Monta o .docx (2 passes: mede páginas dos bookmarks → sumário) e converte → PDF.
  const base: DocxInput = {
    data,
    variant: variantStr,
    logo: await fetchLogo(),
    coverPhoto: bySlot['cover']?.[0] ?? null,
    sheetImages,
    phasePhotos: {
      initial: bySlot['photos_initial'],
      intermediate: bySlot['photos_intermediate'],
      final: bySlot['photos_final'],
    },
    acting: {
      intermediate: toStr(tables['int_figures_acting_as']),
      final: toStr(tables['fin_figures_acting_as']),
    },
  };
  const pass1 = await buildReportDocx(base);
  const pages = await measureBookmarkPages(pass1);
  const docx = await buildReportDocx({ ...base, tocPages: pages });
  const pdf = await convertDocxToPdf(docx);
  const docHash = createHash('sha256').update(JSON.stringify({ data, variant: variantStr })).digest('hex');
  return { pdf, docx, docHash };
}

export async function generatePdf(payload: GeneratePdfPayload): Promise<void> {
  const { reportId } = payload;
  const svc = getServiceClient();

  const row = await loadReport(svc, reportId);
  if (!row) throw new Error(`[generate_pdf] relatório ${reportId} não encontrado.`);
  if (row.status !== 'approved') {
    await auditLog(svc, reportId, null, 'pdf_rejected', {
      reason: `status inválido: ${row.status} (esperado approved)`,
    });
    return;
  }

  const { pdf, docx, docHash } = await renderReportPdf(svc, reportId, row);

  // Upload: PDF VERSIONADO (final-v{n}.pdf, 010/T-005) + .docx editável (mais recente).
  const version = nextPdfVersion(row.pdf_paths ?? []);
  const pdfPath = `${reportId}/final-v${version}.pdf`;
  const docxPath = `${reportId}/final.docx`;
  const up1 = await svc.storage.from(BUCKET).upload(pdfPath, pdf, { contentType: 'application/pdf', upsert: true });
  if (up1.error) throw new Error(`[generate_pdf] falha no upload do PDF: ${up1.error.message}`);
  await svc.storage.from(BUCKET).upload(docxPath, docx, {
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    upsert: true,
  });

  // Transição → generated + auditoria. pdf_paths acumula as versões (download = última).
  const pdfPaths = [...(row.pdf_paths ?? []), pdfPath];
  const { error: updateErr } = await svc
    .from('reports')
    .update({ status: 'generated', document_hash: docHash, pdf_paths: pdfPaths } as never)
    .eq('id', reportId)
    .eq('status', 'approved');
  if (updateErr) throw new Error(`[generate_pdf] falha ao atualizar relatório: ${updateErr.message}`);

  await auditLog(svc, reportId, row.created_by, 'pdf_generated', {
    document_hash: docHash,
    storage_path: pdfPath,
    docx_path: docxPath,
    version,
  });
  console.log(`[generate_pdf] PDF v${version} (.docx nativo) gerado para ${reportId} (hash ${docHash.slice(0, 8)}…)`);
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
    actor: userId,
    action,
    payload: details ?? null,
  } as never);
}
