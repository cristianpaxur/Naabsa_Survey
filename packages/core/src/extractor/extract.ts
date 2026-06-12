/**
 * Pipeline de extração (PRD RF-06, RF-09). Lê a planilha guiado pelo spec:
 * localiza a aba → confere o fingerprint → lê os campos (common + by_variant) →
 * coage os tipos. Produz `{ data, issues }` com issues de nível `error` de
 * extração (aba/fingerprint/coerção). As validações de campo e cruzadas entram
 * no `validate.ts` (T-007), compostas em `runExtraction`.
 *
 * Recebe um `ExcelJS.Workbook` já carregado — o I/O (ler o arquivo do upload/
 * Storage) fica no chamador (app/worker), que faz
 * `new ExcelJS.Workbook().xlsx.load(buffer)`. Mantém o core desacoplado de
 * Buffer/Storage e 100% testável.
 */
import type ExcelJS from 'exceljs';
import type {
  ReportSpec,
  FieldDef,
  Issue,
  ExtractionResult,
  FieldValue,
} from '../types';
import { coerceField, type RawCellValue } from './coerce';

export function extract(
  workbook: ExcelJS.Workbook,
  spec: ReportSpec,
  variant: string | null,
): ExtractionResult {
  const issues: Issue[] = [];
  const data: Record<string, FieldValue> = {};

  const sheet = workbook.getWorksheet(spec.source.sheet);
  if (!sheet) {
    issues.push({
      field: '__sheet__',
      cell: null,
      level: 'error',
      origin: 'extraction',
      message: `Aba '${spec.source.sheet}' não encontrada na planilha.`,
    });
    return { data, issues };
  }

  // Fingerprint (RF-09): confere o tipo da planilha.
  const fp = spec.source.fingerprint;
  const fpRaw = normalizeCell(sheet.getCell(fp.cell).value);
  const fpStr = fpRaw === null ? '' : String(fpRaw).trim();
  if (fpStr !== fp.expect) {
    issues.push({
      field: '__fingerprint__',
      cell: fp.cell,
      level: 'error',
      origin: 'extraction',
      message: `Planilha incompatível: esperado '${fp.expect}' na célula ${fp.cell}, encontrado '${fpStr || '(vazio)'}'.`,
    });
    return { data, issues };
  }

  const date1904 = Boolean(workbook.properties?.date1904);

  for (const [name, field] of collectFields(spec, variant)) {
    const raw = normalizeCell(sheet.getCell(field.cell).value);
    const res = coerceField(raw, field, { date1904 });
    data[name] = res.value;
    if (res.error !== undefined) {
      issues.push({
        field: name,
        cell: field.cell,
        level: 'error',
        origin: 'extraction',
        message: res.error,
      });
    }
  }

  return { data, issues };
}

/** Campos efetivos = common + by_variant[variant] (PRD §8). */
export function collectFields(
  spec: ReportSpec,
  variant: string | null,
): [string, FieldDef][] {
  const entries: [string, FieldDef][] = Object.entries(
    spec.source.common.fields,
  );
  if (variant !== null) {
    const block = spec.source.by_variant?.[variant];
    if (block) entries.push(...Object.entries(block.fields));
  }
  return entries;
}

/** Resolve o valor de uma célula do ExcelJS a um primitivo. */
export function normalizeCell(value: ExcelJS.CellValue): RawCellValue {
  if (value === null || value === undefined) return null;
  if (
    typeof value === 'number' ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    if ('result' in value) {
      return normalizeCell((value.result ?? null) as ExcelJS.CellValue);
    }
    if ('richText' in value) {
      return value.richText.map((rt) => rt.text).join('');
    }
    if ('text' in value) return String(value.text);
    // CellErrorValue (#REF!, #DIV/0!, …) → tratado como vazio.
  }
  return null;
}
