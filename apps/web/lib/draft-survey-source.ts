import ExcelJS from 'exceljs';
import {
  needsDraftSurveySourceRecovery,
  recoverDraftSurveySourceData,
  type FieldValue,
  type ReportSpec,
} from '@naabsa/core';

/** Relatórios já extraídos consultam as abas de origem sem alterar os dados salvos. */
export async function loadDraftSurveySourceData(
  reportId: string,
  spreadsheetPath: string | null | undefined,
  spec: ReportSpec,
  variant: string | null,
  extracted: Record<string, FieldValue> | null | undefined,
): Promise<Record<string, FieldValue>> {
  const data = extracted ?? {};
  if (
    spreadsheetPath !== `${reportId}/spreadsheet.xlsx` ||
    !needsDraftSurveySourceRecovery(spec, variant, data)
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
    return recoverDraftSurveySourceData(workbook, spec, variant, data);
  } catch {
    return data;
  }
}
