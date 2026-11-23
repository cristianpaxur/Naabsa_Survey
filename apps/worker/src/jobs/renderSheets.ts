/**
 * Job `render_sheets` — renderiza as abas de fase da planilha como PNG
 * (pixel-perfeito via LibreOffice) e sobe ao Storage em
 * `reports/{id}/sheets/`. Consumido com concorrência 1 (LibreOffice
 * é pesado). Disparado após o upload/extração (apps/web).
 *
 * O builder (004) embute essas imagens no "Draft details"; sem elas, cai nas
 * grades nativas. Falha por fase não bloqueia as demais.
 */
import { getServiceClient } from '../lib/supabase';
import { renderSheetPng } from '../lib/sheetImage';
import {
  DRAFT_SURVEY_SHEET_PHASES,
  draftSurveySheetImagePath,
  hasDraftSurveyIntermediate,
  type DraftSurveySheetPhase,
  type FieldValue,
  type ReportSpec,
} from '@naabsa/core';

export const RENDER_SHEETS_QUEUE = 'render_sheets';
export const RENDER_SHEETS_CONCURRENCY = 1;
export const RENDER_SHEETS_RETRY_LIMIT = 1;

export interface RenderSheetsPayload {
  reportId: string;
}

const phaseTable: Record<DraftSurveySheetPhase, string> = {
  initial: 'init_draft_marks',
  intermediate: 'int_draft_marks',
  final: 'fin_draft_marks',
};

export async function renderSheets(data: RenderSheetsPayload): Promise<void> {
  const { reportId } = data;
  const svc = getServiceClient();

  const { data: report } = await svc
    .from('reports')
    .select('spec_id, spreadsheet_path, extracted_data')
    .eq('id', reportId)
    .is('deleted_at', null)
    .single();
  const r = report as {
    spec_id: string;
    spreadsheet_path: string | null;
    extracted_data: Record<string, FieldValue> | null;
  } | null;
  if (!r?.spreadsheet_path || !r.spec_id) {
    console.log(`[render_sheets] ${reportId} sem planilha/spec — pulando.`);
    return;
  }

  const { data: specRow } = await svc
    .from('report_specs')
    .select('spec')
    .eq('id', r.spec_id)
    .single();
  const spec = (specRow as { spec: ReportSpec } | null)?.spec;
  if (!spec) return;

  const { data: blob, error: dlErr } = await svc.storage
    .from('reports')
    .download(r.spreadsheet_path);
  if (dlErr || !blob) {
    console.error(
      `[render_sheets] falha ao baixar planilha de ${reportId}:`,
      dlErr?.message,
    );
    return;
  }
  const buf = Buffer.from(await blob.arrayBuffer());

  const hasIntermediate = hasDraftSurveyIntermediate(r.extracted_data ?? {});

  for (const phase of DRAFT_SURVEY_SHEET_PHASES) {
    if (phase === 'intermediate' && !hasIntermediate) continue; // fase ausente
    const sheet = spec.source.tables?.find(
      (table) => table.id === phaseTable[phase],
    )?.sheet;
    if (!sheet) continue;
    try {
      const png = await renderSheetPng(buf, sheet);
      const { error: upErr } = await svc.storage
        .from('reports')
        .upload(draftSurveySheetImagePath(reportId, phase), png, {
          contentType: 'image/png',
          upsert: true,
        });
      if (upErr) throw new Error(upErr.message);
      console.log(
        `[render_sheets] ${reportId} fase ${phase} (aba ${sheet}) ok (${png.length} B).`,
      );
    } catch (err) {
      console.error(
        `[render_sheets] ${reportId} fase ${phase} (aba ${sheet}) falhou:`,
        err,
      );
    }
  }
}
