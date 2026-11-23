import ExcelJS from 'exceljs';
import {
  DRAFT_SURVEY_INTERMEDIATE_CARGO_FIELD,
  draftSurveyIntermediateCargoSource,
  readDraftSurveyIntermediateCargo,
  type FieldValue,
  type ReportSpec,
} from '@naabsa/core';

/** Relatórios já extraídos consultam O19 sem alterar os dados salvos. */
export async function loadDraftSurveySourceData(
  reportId: string,
  spreadsheetPath: string | null | undefined,
  spec: ReportSpec,
  extracted: Record<string, FieldValue> | null | undefined,
): Promise<Record<string, FieldValue>> {
  const data = extracted ?? {};
  if (
    Object.hasOwn(data, DRAFT_SURVEY_INTERMEDIATE_CARGO_FIELD) ||
    spreadsheetPath !== `${reportId}/spreadsheet.xlsx` ||
    !draftSurveyIntermediateCargoSource(spec)
  ) {
    return data;
  }

  try {
    const { createServiceClient } = await import('@/lib/supabase/service');
    const { data: blob, error } = await createServiceClient()
      .storage.from('reports')
      .download(spreadsheetPath);
    if (error || !blob) return data;

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await blob.arrayBuffer());
    const cargo = readDraftSurveyIntermediateCargo(workbook, spec);
    return cargo === undefined
      ? data
      : { ...data, [DRAFT_SURVEY_INTERMEDIATE_CARGO_FIELD]: cargo };
  } catch {
    return data;
  }
}
