import 'server-only';
import ExcelJS from 'exceljs';
import {
  buildDraftSurvey,
  collectFields,
  resolveFieldValue,
  runExtraction,
  type ReportSpec,
  type FieldValue,
  type TipTapDoc,
  type PhotoAlloc,
  type BuilderInput,
} from '@naabsa/core';
import type { ServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * Montagem do documento (008/T-006, RF-20).
 *
 * Resolve valores efetivos (extracted_data + operator_overrides) e fotos
 * alocadas, e chama o builder do tipo (004). O `src` de cada foto é o CAMINHO
 * de Storage da versão processada — a rota /print resolve para URL assinada no
 * render (assim o document_json nunca guarda URLs que expiram).
 */

/** Registro builder por slug de tipo. Só draft_survey por enquanto (009 amplia). */
const BUILDERS: Record<string, (input: BuilderInput) => TipTapDoc> = {
  draft_survey: buildDraftSurvey,
};

/** Resolve os valores efetivos (flat) de todos os campos do spec/variante. */
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

interface AllocatedPhotoRow {
  id: string;
  slot_id: string | null;
  processed_path: string | null;
  crop: { x: number; y: number; width: number; height: number } | null;
}

/** Carrega as fotos alocadas (slot preenchido, processadas) como PhotoAlloc[]. */
async function loadAllocatedPhotos(
  supabase: ServerClient,
  reportId: string,
): Promise<PhotoAlloc[]> {
  const { data } = await supabase
    .from('report_photos')
    .select('id,slot_id,processed_path,crop')
    .eq('report_id', reportId)
    .not('slot_id', 'is', null)
    .order('position', { ascending: true });

  const rows = (data as AllocatedPhotoRow[] | null) ?? [];
  return rows
    .filter((r) => r.slot_id && r.processed_path)
    .map((r) => ({
      slotId: r.slot_id as string,
      photoId: r.id,
      // Caminho de Storage — a rota /print assina no render.
      src: r.processed_path as string,
      crop: r.crop,
    }));
}

export interface AssembleInput {
  slug: string;
  spec: ReportSpec;
  variant: string | null;
  extracted: Record<string, FieldValue>;
  overrides: Record<string, FieldValue> | null;
}

/**
 * Caminhos das imagens das abas da planilha (print pixel-perfeito) por fase,
 * geradas pelo worker (`render_sheets`) em `reports/{id}/sheets/{phase}.png`.
 * Retorna null por fase ausente — o builder cai nas grades nativas.
 */
async function loadSheetImages(
  reportId: string,
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = { initial: null, intermediate: null, final: null };
  try {
    const svc = createServiceClient();
    const { data } = await svc.storage.from('reports').list(`${reportId}/sheets`);
    for (const f of data ?? []) {
      const phase = f.name.replace(/\.png$/i, '');
      if (phase in out) out[phase] = `${reportId}/sheets/${f.name}`;
    }
  } catch {
    /* sem imagens — usa grades nativas */
  }
  return out;
}

/**
 * Re-extrai as tabelas range-based (grades, figures acting-as) a partir da
 * planilha guardada no Storage. As tabelas não são persistidas em `reports`
 * (só `extracted_data`), então as recalculamos aqui na montagem do documento.
 * Falha (planilha ausente/ilegível) degrada para `{}` — o builder omite as
 * grades vazias sem quebrar o documento.
 */
async function loadTables(
  supabase: ServerClient,
  reportId: string,
  spec: ReportSpec,
  variant: string | null,
): Promise<Record<string, FieldValue[][]>> {
  try {
    const { data: row } = await supabase
      .from('reports')
      .select('spreadsheet_path')
      .eq('id', reportId)
      .maybeSingle();
    const path = (row as { spreadsheet_path: string | null } | null)?.spreadsheet_path;
    if (!path) return {};

    const svc = createServiceClient();
    const { data: blob, error } = await svc.storage.from('reports').download(path);
    if (error || !blob) return {};

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    const { tables } = runExtraction(wb, spec, variant);
    return tables;
  } catch {
    return {};
  }
}

/**
 * Monta o `document_json` de um relatório. Lança erro pt-BR se não houver
 * builder para o tipo.
 */
export async function assembleDocument(
  supabase: ServerClient,
  reportId: string,
  input: AssembleInput,
): Promise<TipTapDoc> {
  const builder = BUILDERS[input.slug];
  if (!builder) {
    throw new Error(
      `Sem builder de documento para o tipo "${input.slug}" (pendente na implementação 009).`,
    );
  }

  const data = effectiveData(
    input.spec,
    input.variant,
    input.extracted,
    input.overrides,
  );
  const photos = await loadAllocatedPhotos(supabase, reportId);
  const tables = await loadTables(supabase, reportId, input.spec, input.variant);
  const sheetImages = await loadSheetImages(reportId);

  return builder({ spec: input.spec, variant: input.variant, data, tables, photos, sheetImages });
}
