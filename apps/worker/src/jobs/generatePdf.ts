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
  runExtraction,
  collectFields,
  resolveFieldValue,
  resolveVariant,
  type ReportSpec,
  type FieldValue,
} from '@naabsa/core';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { getServiceClient } from '../lib/supabase';
import { buildReportDocx, type DocxInput } from '../lib/buildDocx';
import type { DocxInputMsc, TimeLogRow } from '../lib/buildDocxMsc';
import { convertDocxToPdf, measureBookmarkPages } from '../lib/soffice';
import { renderSheetPng } from '../lib/sheetImage';
import { validateDocumentLayout } from '../lib/documentLayoutQa';

export interface GeneratePdfPayload {
  reportId: string;
  approvedRevision?: number;
}

export const GENERATE_PDF_QUEUE = 'generate_pdf';
export const GENERATE_PDF_CONCURRENCY = 1;
export const GENERATE_PDF_RETRY_LIMIT = 2;
// Orçamento total (.docx 2-pass + LibreOffice). Os limites duros por etapa ficam
// em lib/soffice.ts (medição 90s, conversão 120s) — eles matam processos travados.
export const GENERATE_PDF_TIMEOUT_S = 300;

const BUCKET = 'reports';
type SheetPhase = 'initial' | 'intermediate' | 'final';

export function missingRequiredSheetPhases(
  images: Record<SheetPhase, Buffer | null>,
  hasIntermediate: boolean,
): SheetPhase[] {
  const required: SheetPhase[] = hasIntermediate
    ? ['initial', 'intermediate', 'final']
    : ['initial', 'final'];
  return required.filter((phase) => !images[phase]);
}

/** Logo NAABSA, cacheado. Null se indisponível (header cai em texto). */
let logoCache: Buffer | null | undefined;
async function fetchLogo(): Promise<Buffer | null> {
  if (logoCache !== undefined) return logoCache;
  try {
    // 1) Arquivo EMPACOTADO no worker — robusto, sem depender do web/APP_BASE_URL.
    const localPath = join(import.meta.dirname, '../../assets/naabsa-logo.jpg');
    if (existsSync(localPath)) {
      logoCache = await readFile(localPath);
      return logoCache;
    }
    // 2) Fallback: busca no web via APP_BASE_URL, se configurado.
    const base = process.env['APP_BASE_URL'];
    const res = base ? await fetch(`${base}/naabsa-logo.jpg`) : null;
    logoCache = res?.ok ? Buffer.from(await res.arrayBuffer()) : null;
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
  Array.isArray(m)
    ? (m as unknown[][]).map((r) => r.map((c) => (c == null ? '' : String(c))))
    : [];

interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}
/** Aplica o crop (normalizado 0-1, relativo à imagem processada) via sharp. */
async function applyCrop(buf: Buffer, crop: Crop | null): Promise<Buffer> {
  if (!crop) return buf;
  try {
    const meta = await sharp(buf).metadata();
    const W = meta.width ?? 0,
      H = meta.height ?? 0;
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

async function download(
  svc: ReturnType<typeof getServiceClient>,
  path: string,
) {
  const { data, error } = await svc.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

export interface ReportRow {
  status: string;
  working_docx_path: string | null;
  working_docx_revision: number;
  working_docx_generation: string;
  approved_docx_path: string | null;
  approved_docx_revision: number | null;
  variant: string | null;
  spec_id: string;
  extracted_data: unknown;
  operator_overrides: unknown;
  spreadsheet_path: string | null;
  created_by: string | null;
  pdf_paths: string[] | null;
  /** Slug do report_type — usado para escolher o builder (msc, draft_survey). */
  type_slug?: string | null;
}

export async function loadReport(
  svc: ReturnType<typeof getServiceClient>,
  reportId: string,
): Promise<ReportRow | null> {
  const { data, error } = await svc
    .from('reports')
    .select(
      'status, working_docx_path, working_docx_revision, working_docx_generation, approved_docx_path, approved_docx_revision, variant, spec_id, extracted_data, operator_overrides, spreadsheet_path, created_by, pdf_paths, report_types(slug)',
    )
    .eq('id', reportId)
    .is('deleted_at', null)
    .single();
  if (error || !data) return null;
  const row = data as unknown as ReportRow & {
    report_types: { slug: string } | null;
  };
  return { ...row, type_slug: row.report_types?.slug ?? null };
}

/** Próxima versão do PDF a partir dos caminhos existentes (final-v{n}.pdf). */
export function nextPdfVersion(paths: string[]): number {
  let max = 0;
  for (const p of paths) {
    const m = /final-v(\d+)(?:-r\d+)?\.pdf$/.exec(p);
    if (m) max = Math.max(max, parseInt(m[1]!, 10));
  }
  return max + 1;
}

/** Converte um valor de célula ExcelJS para o formato usado pelo Time Log. */
function excelDateToISO(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  // Tempo puro (1899-12-30) ⇒ não é data, só hora.
  if (y === 1899 && m === '12' && day === '30') return '';
  return `${y}-${m}-${day}`;
}
function excelDateToTime(d: Date | null | undefined): string {
  if (!d) return '';
  if (d.getUTCFullYear() !== 1899) return ''; // veio data, não hora
  const h = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${h}:${mm}`;
}

/**
 * Lê a aba `Time Log` crua do ExcelJS (B5:I16), convertendo Date → ISO.
 * B = evento, F = data, G = hora, H = flag, I = hora fim.
 */
function readTimeLog(
  wb: ExcelJS.Workbook,
): { event: string; date: string; start: string; flag: string; end: string }[] {
  const ws = wb.getWorksheet('Time Log');
  if (!ws) return [];
  const rows: {
    event: string;
    date: string;
    start: string;
    flag: string;
    end: string;
  }[] = [];
  for (let r = 5; r <= 16; r++) {
    const event = String(ws.getCell(r, 2).value ?? '').trim();
    if (!event) continue;
    const dateRaw = ws.getCell(r, 6).value;
    const startRaw = ws.getCell(r, 7).value;
    const flag = String(ws.getCell(r, 8).value ?? '').trim();
    const endRaw = ws.getCell(r, 9).value;
    const date =
      dateRaw instanceof Date
        ? excelDateToISO(dateRaw)
        : dateRaw == null
          ? ''
          : String(dateRaw);
    const start =
      startRaw instanceof Date
        ? excelDateToTime(startRaw)
        : startRaw == null
          ? ''
          : String(startRaw);
    const end =
      endRaw instanceof Date
        ? excelDateToTime(endRaw)
        : endRaw == null
          ? ''
          : String(endRaw);
    rows.push({ event, date, start, flag, end });
  }
  return rows;
}

/**
 * Monta o `working.docx` a partir dos dados efetivos + planilha + fotos (2 passes:
 * mede páginas dos bookmarks → sumário com nº reais). É o documento editável aberto
 * no Collabora (012) e a base do PDF. NÃO converte nem persiste — quem chama decide.
 *
 * Despacha por `row.type_slug`: `msc` → buildReportDocxMsc (sem variante, sem phases);
 * default → buildReportDocx (draft_survey, com fases Initial/Intermediate/Final).
 */
export interface BuiltWorkingDocx {
  docx: Buffer;
  data: Record<string, FieldValue>;
  variant: 'loading' | 'discharge' | null;
}
export async function buildWorkingDocx(
  svc: ReturnType<typeof getServiceClient>,
  reportId: string,
  row: ReportRow,
): Promise<BuiltWorkingDocx> {
  // Spec congelado.
  const { data: specRow } = await svc
    .from('report_specs')
    .select('spec')
    .eq('id', row.spec_id)
    .single();
  const spec = (specRow as { spec: ReportSpec } | null)?.spec;
  if (!spec)
    throw new Error(`[generate_pdf] spec ${row.spec_id} não encontrado.`);

  // Planilha → variante AUTORITATIVA (spec resolve de Capa!L4) + tabelas (figures).
  let wb: ExcelJS.Workbook | null = null;
  let spreadsheetBuf: Buffer | null = null;
  if (row.spreadsheet_path) {
    const xlsx = await download(svc, row.spreadsheet_path);
    if (xlsx) {
      spreadsheetBuf = xlsx;
      wb = new ExcelJS.Workbook();
      // cast p/ o tipo exato esperado (conflito de versões de Buffer entre @types/node).
      await wb.xlsx.load(xlsx as unknown as Parameters<typeof wb.xlsx.load>[0]);
    }
  }
  const variant = (wb ? resolveVariant(wb, spec).variant : null) ?? row.variant;
  const variantStr: 'loading' | 'discharge' | null =
    variant === 'discharge'
      ? 'discharge'
      : variant === 'loading'
        ? 'loading'
        : null;
  const extracted = (row.extracted_data ?? {}) as unknown as Record<
    string,
    FieldValue
  >;
  const overrides = (row.operator_overrides ?? {}) as unknown as Record<
    string,
    FieldValue
  >;
  const data = effectiveData(spec, variant, extracted, overrides);
  const tables: Record<string, FieldValue[][]> = wb
    ? runExtraction(wb, spec, variant).tables
    : {};

  const logo = await fetchLogo();

  // ── MSC: builder dedicado (sem variantes, sem sheetImages, sem phases). ──
  if (row.type_slug === 'msc') {
    const { buildReportDocxMsc } = await import('../lib/buildDocxMsc');
    const { data: photoRows } = await svc
      .from('report_photos')
      .select('slot_id, processed_path, position, crop')
      .eq('report_id', reportId)
      .is('removed_at', null)
      .eq('ai_suggested', false)
      .eq('status', 'done')
      .not('slot_id', 'is', null)
      .order('position', { ascending: true });
    const photos: DocxInputMsc['photos'] = {
      vessel: [],
      engine_room: [],
      survey_attendance: [],
      ecr: [],
      hull: [],
    };
    for (const r of (photoRows ?? []) as {
      slot_id: string | null;
      processed_path: string | null;
      crop: Crop | null;
    }[]) {
      if (!r.slot_id || !r.processed_path) continue;
      if (
        !['vessel', 'engine_room', 'survey_attendance', 'ecr', 'hull'].includes(
          r.slot_id,
        )
      )
        continue;
      const buf = await download(svc, r.processed_path);
      if (buf)
        (photos[r.slot_id as keyof typeof photos] ??= []).push(
          await applyCrop(buf, r.crop),
        );
    }
    // Lê o Time Log direto da planilha (ExcelJS serializa Date com hora cheia;
    // o extractTables do core trunca em YYYY-MM-DD e perderíamos G/I).
    const timeLogRows: TimeLogRow[] = wb ? readTimeLog(wb) : [];
    const base: DocxInputMsc = {
      data,
      logo,
      photos,
      timeLogRows,
    };
    const pass1 = await buildReportDocxMsc(base);
    const pages = await measureBookmarkPages(pass1);
    const docx = await buildReportDocxMsc({ ...base, tocPages: pages });
    return { docx, data, variant: null };
  }

  // ── Default (draft_survey, e futuros tipos sem builder dedicado). ──
  // Prints das abas (render_sheets) + fotos por slot (com crop).
  // Fallback: se algum PNG ainda não foi gerado pelo job render_sheets, renderiza
  // inline para garantir que a imagem apareça no docx.
  const sheetImagePath = (phase: 'initial' | 'intermediate' | 'final') =>
    `${reportId}/sheets/${phase}.png`;
  const sheetImages: {
    initial: Buffer | null;
    intermediate: Buffer | null;
    final: Buffer | null;
  } = {
    initial: await download(svc, sheetImagePath('initial')),
    intermediate: await download(svc, sheetImagePath('intermediate')),
    final: await download(svc, sheetImagePath('final')),
  };
  // Baixa a planilha uma vez para usar em qualquer render sob demanda.
  const ensureSpreadsheetBuf = async (): Promise<Buffer | null> => {
    if (spreadsheetBuf) return spreadsheetBuf;
    if (!row.spreadsheet_path) return null;
    spreadsheetBuf = await download(svc, row.spreadsheet_path);
    return spreadsheetBuf;
  };
  // Pega a lista de sheets do spec para mapear phase→sheet.
  let phaseMap: Record<SheetPhase, string | null> = {
    initial: 'Inicial',
    intermediate: 'Intermediario',
    final: 'final',
  };
  if (spec.source.tables) {
    const t = (id: string) =>
      spec.source.tables?.find((x) => x.id === id)?.sheet ?? null;
    phaseMap = {
      initial: t('init_draft_marks'),
      intermediate: t('int_draft_marks'),
      final: t('fin_draft_marks'),
    };
  }
  const hasIntermediate =
    data['intermediate_date'] != null && data['intermediate_date'] !== '';
  for (const phase of ['initial', 'intermediate', 'final'] as const) {
    if (sheetImages[phase]) continue; // já existe
    if (phase === 'intermediate' && !hasIntermediate) continue; // fase ausente
    const sheet = phaseMap[phase];
    if (!sheet) continue;
    const buf = await ensureSpreadsheetBuf();
    if (!buf) continue;
    try {
      const png = await renderSheetPng(buf, sheet);
      sheetImages[phase] = png;
      // Sobe também para o storage (cache para o render_sheets job).
      await svc.storage.from('reports').upload(sheetImagePath(phase), png, {
        contentType: 'image/png',
        upsert: true,
      });
    } catch (err) {
      console.error(
        `[generate_pdf] render inline de ${phase}/${sheet} falhou:`,
        err,
      );
    }
  }
  const missingSheets = missingRequiredSheetPhases(
    sheetImages,
    hasIntermediate,
  );
  if (missingSheets.length > 0) {
    throw new Error(
      `[generate_pdf] prints obrigatórios da planilha ausentes: ${missingSheets.join(', ')}. ` +
        'O relatório não será montado sem essas imagens.',
    );
  }
  const { data: photoRows } = await svc
    .from('report_photos')
    .select('slot_id, processed_path, position, crop')
    .eq('report_id', reportId)
    .is('removed_at', null)
    .eq('ai_suggested', false)
    .eq('status', 'done')
    .not('slot_id', 'is', null)
    .order('position', { ascending: true });
  const bySlot: Record<string, Buffer[]> = {};
  for (const r of (photoRows ?? []) as {
    slot_id: string | null;
    processed_path: string | null;
    crop: Crop | null;
  }[]) {
    if (!r.slot_id || !r.processed_path) continue;
    const buf = await download(svc, r.processed_path);
    if (buf) (bySlot[r.slot_id] ??= []).push(await applyCrop(buf, r.crop));
  }

  // Monta o .docx em 2 passes (mede páginas dos bookmarks → sumário com nº reais).
  // Fotografias começam 8% menores que no template. O PDF intermediário passa por
  // um gate visual; se houver página vazia/quebra causada por foto, reconstruímos
  // uma vez com escala mais compacta antes de publicar o working.docx.
  const base: DocxInput = {
    data,
    variant: variantStr ?? 'loading',
    logo,
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
  const photoScales = [0.92, 0.84] as const;
  for (const [index, photoScale] of photoScales.entries()) {
    const candidate = { ...base, photoScale };
    const pass1 = await buildReportDocx(candidate);
    const pages = await measureBookmarkPages(pass1);
    const docx = await buildReportDocx({ ...candidate, tocPages: pages });
    const qaPdf = await convertDocxToPdf(docx);
    const qa = await validateDocumentLayout(qaPdf, reportId);
    console.log(
      `[build_working_docx] layout ${reportId}: escala=${photoScale}, páginas=${qa.pageCount}, ` +
        `vazias=${qa.blankPages.join(',') || 'nenhuma'}, ia_reduzir=${qa.aiRequestedSmallerPhotos}`,
    );
    if (qa.ok) return { docx, data, variant: variantStr ?? 'loading' };

    const isLast = index === photoScales.length - 1;
    if (!isLast) continue;
    if (qa.blankPages.length > 0) {
      throw new Error(
        `[build_working_docx] validação visual reprovou páginas vazias: ${qa.blankPages.join(', ')}.`,
      );
    }
    // A revisão por IA é consultiva: ela aciona a redução automática, mas nunca
    // bloqueia o relatório se o verificador determinístico aprovou a versão final.
    if (qa.aiRequestedSmallerPhotos) {
      console.warn(
        `[build_working_docx] IA ainda sinalizou o layout compacto: ${qa.aiIssues.join('; ') || 'sem detalhe'}`,
      );
    }
    return { docx, data, variant: variantStr ?? 'loading' };
  }
  throw new Error(
    '[build_working_docx] nenhuma variante de layout foi gerada.',
  );
}

/**
 * Converte o `working.docx` EDITADO (no Collabora, 012) em PDF — é o documento que
 * o operador finalizou, não um rebuild dos dados. Se o objeto estiver ausente,
 * falha de forma recuperável: jamais troca uma edição por dados reconstruídos.
 * `docHash` = sha256 dos bytes do .docx (identidade do que virou PDF).
 * NÃO checa status nem transiciona — quem chama decide o que fazer com o PDF.
 */
export async function convertWorkingDocxToPdf(
  svc: ReturnType<typeof getServiceClient>,
  reportId: string,
  row: ReportRow,
): Promise<{ pdf: Buffer; docx: Buffer; docHash: string }> {
  const path =
    row.status === 'approved' || row.status === 'generated'
      ? row.approved_docx_path
      : row.working_docx_path;
  if (!path)
    throw new Error(
      '[generate_pdf] Documento salvo não encontrado. Abra o editor antes de gerar.',
    );
  const docx = await download(svc, path);
  if (!docx)
    throw new Error(
      '[generate_pdf] Não foi possível ler a versão salva. Tente novamente.',
    );
  let pdf: Buffer;
  try {
    pdf = await convertDocxToPdf(docx);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[generate_pdf] Não foi possível converter o documento salvo em PDF. ` +
        `Confirme se o serviço de conversão está disponível e tente novamente. Detalhe: ${detail}`,
    );
  }
  const docHash = createHash('sha256').update(docx).digest('hex');
  return { pdf, docx, docHash };
}

export async function generatePdf(payload: GeneratePdfPayload): Promise<void> {
  const { reportId } = payload;
  const svc = getServiceClient();

  const row = await loadReport(svc, reportId);
  if (!row)
    throw new Error(`[generate_pdf] relatório ${reportId} não encontrado.`);
  if (
    row.status !== 'approved' ||
    payload.approvedRevision === undefined ||
    payload.approvedRevision !== row.approved_docx_revision
  ) {
    await auditLog(svc, reportId, null, 'pdf_rejected', {
      reason: `status inválido: ${row.status} (esperado approved)`,
    });
    return;
  }

  const { pdf, docx, docHash } = await convertWorkingDocxToPdf(
    svc,
    reportId,
    row,
  );
  if (!row.approved_docx_path)
    throw new Error('[generate_pdf] Snapshot aprovado ausente.');

  // Upload: PDF VERSIONADO (final-v{n}.pdf, 010/T-005) + .docx editável (mais recente).
  const version = nextPdfVersion(row.pdf_paths ?? []);
  const pdfPath = `${reportId}/final-v${version}-r${payload.approvedRevision}.pdf`;
  const docxPath = `${reportId}/final-v${version}-r${payload.approvedRevision}.docx`;
  const up1 = await svc.storage
    .from(BUCKET)
    .upload(pdfPath, pdf, { contentType: 'application/pdf', upsert: false });
  if (up1.error && !isDuplicateObject(up1.error))
    throw new Error(
      `[generate_pdf] falha no upload do PDF: ${up1.error.message}`,
    );
  const up2 = await svc.storage.from(BUCKET).upload(docxPath, docx, {
    contentType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    upsert: false,
  });
  if (up2.error && !isDuplicateObject(up2.error))
    throw new Error(
      `[generate_pdf] falha no upload DOCX: ${up2.error.message}`,
    );

  // Transição → generated + auditoria. pdf_paths acumula as versões (download = última).
  const pdfPaths = [...(row.pdf_paths ?? []), pdfPath];
  const { error: updateErr, count } = await svc
    .from('reports')
    .update(
      {
        status: 'generated',
        document_hash: docHash,
        pdf_paths: pdfPaths,
      } as never,
      { count: 'exact' },
    )
    .eq('id', reportId)
    .eq('status', 'approved')
    .eq('approved_docx_revision', payload.approvedRevision)
    .eq('approved_docx_path', row.approved_docx_path);
  if (updateErr)
    throw new Error(
      `[generate_pdf] falha ao atualizar relatório: ${updateErr.message}`,
    );
  if (count !== 1) return;

  await auditLog(svc, reportId, row.created_by, 'pdf_generated', {
    document_hash: docHash,
    storage_path: pdfPath,
    docx_path: docxPath,
    version,
  });
  console.log(
    `[generate_pdf] PDF v${version} (.docx nativo) gerado para ${reportId} (hash ${docHash.slice(0, 8)}…)`,
  );
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

function isDuplicateObject(error: {
  message: string;
  statusCode?: string | number;
}): boolean {
  return (
    String(error.statusCode) === '409' ||
    /already exists|duplicate/i.test(error.message)
  );
}
