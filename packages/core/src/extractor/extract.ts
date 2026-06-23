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

  // Aba do fingerprint: própria (v2) ou a aba única (v1).
  const fp = spec.source.fingerprint;
  const fpSheetName = sheetOf(fp.sheet, spec);
  if (!fpSheetName) {
    issues.push(sheetIssue('Spec sem aba para o fingerprint (defina sheet).'));
    return { data, issues };
  }
  const fpSheet = workbook.getWorksheet(fpSheetName);
  if (!fpSheet) {
    issues.push(sheetIssue(`Aba '${fpSheetName}' não encontrada na planilha.`));
    return { data, issues };
  }

  // Fingerprint (RF-09): confere o tipo da planilha.
  const fpRaw = normalizeCell(fpSheet.getCell(fp.cell).value);
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

  const fields = collectFields(spec, variant);

  // Todas as abas necessárias devem existir (RF-08 multi-aba). Uma aba ausente
  // é bloqueante: emite um __sheet__ por aba faltante e aborta a extração.
  const needed = new Set<string>();
  for (const [name, field] of fields) {
    const s = sheetOf(field.sheet, spec);
    if (!s) {
      issues.push(sheetIssue(`Campo '${name}' sem aba (defina sheet).`));
    } else {
      needed.add(s);
    }
  }
  if (issues.length > 0) return { data, issues };
  const missing = [...needed].filter((s) => !workbook.getWorksheet(s));
  if (missing.length > 0) {
    for (const s of missing) {
      issues.push(sheetIssue(`Aba '${s}' não encontrada na planilha.`));
    }
    return { data, issues };
  }

  const date1904 = Boolean(workbook.properties?.date1904);

  for (const [name, field] of fields) {
    const ws = workbook.getWorksheet(sheetOf(field.sheet, spec) as string);
    const raw = normalizeCell(ws!.getCell(field.cell).value);
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

/** Aba efetiva de um item: a própria (v2) ou a aba única do spec (v1). */
function sheetOf(own: string | undefined, spec: ReportSpec): string | undefined {
  return own ?? spec.source.sheet;
}

function sheetIssue(message: string): Issue {
  return { field: '__sheet__', cell: null, level: 'error', origin: 'extraction', message };
}

/**
 * Resolve a variante a partir da planilha quando o spec define
 * `source.variant_source` (v2). Lê a célula, mapeia o texto e devolve a variante;
 * valor fora do `map` vira um `Issue` de erro e variante `null` (RF-09 análogo).
 */
export function resolveVariant(
  workbook: ExcelJS.Workbook,
  spec: ReportSpec,
): { variant: string | null; issue?: Issue } {
  const vs = spec.source.variant_source;
  if (!vs) return { variant: null };

  const ws = workbook.getWorksheet(vs.sheet);
  if (!ws) {
    return {
      variant: null,
      issue: sheetIssue(`Aba '${vs.sheet}' (variant_source) não encontrada.`),
    };
  }
  const raw = normalizeCell(ws.getCell(vs.cell).value);
  const key = raw === null ? '' : String(raw).trim();
  const mapped = vs.map[key];
  if (mapped === undefined) {
    return {
      variant: null,
      issue: {
        field: '__variant__',
        cell: vs.cell,
        level: 'error',
        origin: 'extraction',
        message: `Tipo de atendimento '${key || '(vazio)'}' na célula ${vs.cell} não reconhecido (esperado: ${Object.keys(vs.map).join(', ')}).`,
      },
    };
  }
  return { variant: mapped };
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
