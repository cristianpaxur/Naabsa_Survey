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
    return { data, tables: {}, issues };
  }
  const fpSheet = workbook.getWorksheet(fpSheetName);
  if (!fpSheet) {
    issues.push(sheetIssue(`Aba '${fpSheetName}' não encontrada na planilha.`));
    return { data, tables: {}, issues };
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
    return { data, tables: {}, issues };
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
  if (issues.length > 0) return { data, tables: {}, issues };
  const missing = [...needed].filter((s) => !workbook.getWorksheet(s));
  if (missing.length > 0) {
    for (const s of missing) {
      issues.push(sheetIssue(`Aba '${s}' não encontrada na planilha.`));
    }
    return { data, tables: {}, issues };
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

  // Tabelas range-based (v2) — erros não bloqueiam os campos já extraídos.
  const { tables, issues: tableIssues } = extractTables(workbook, spec);
  return { data, tables, issues: [...issues, ...tableIssues] };
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

// ── Extração de tabelas range-based (v2, CA-010) ───────────────────────────

/**
 * Lê `source.tables[]` do spec e devolve um mapa id → matriz de FieldValue.
 * Tabelas `optional` com todas as células nulas são omitidas silenciosamente.
 * Erros de aba/range usam field `__table__` (não bloqueante no pipeline).
 */
function extractTables(
  workbook: ExcelJS.Workbook,
  spec: ReportSpec,
): { tables: Record<string, FieldValue[][]>; issues: Issue[] } {
  const tables: Record<string, FieldValue[][]> = {};
  const issues: Issue[] = [];

  for (const tableDef of spec.source.tables ?? []) {
    const ws = workbook.getWorksheet(tableDef.sheet);
    if (!ws) {
      if (!tableDef.optional) {
        issues.push({
          field: '__table__',
          cell: null,
          level: 'error',
          origin: 'extraction',
          message: `Tabela '${tableDef.id}': aba '${tableDef.sheet}' não encontrada.`,
        });
      }
      continue;
    }

    let bounds: ReturnType<typeof parseRange>;
    try {
      bounds = parseRange(tableDef.range);
    } catch {
      issues.push({
        field: '__table__',
        cell: null,
        level: 'error',
        origin: 'extraction',
        message: `Tabela '${tableDef.id}': intervalo inválido '${tableDef.range}'.`,
      });
      continue;
    }

    const { startCol, startRow, endCol, endRow } = bounds;
    const matrix: FieldValue[][] = [];

    for (let r = startRow; r <= endRow; r++) {
      const row: FieldValue[] = [];
      for (let c = startCol; c <= endCol; c++) {
        const raw = normalizeCell(ws.getCell(r, c).value);
        row.push(rawToFieldValue(raw));
      }
      matrix.push(row);
    }

    const isEmpty = matrix.every((row) => row.every((cell) => cell === null));
    if (isEmpty && tableDef.optional) continue;

    tables[tableDef.id] = matrix;
  }

  return { tables, issues };
}

/** Converte o valor cru de uma célula de tabela para FieldValue serializável. */
function rawToFieldValue(raw: RawCellValue): FieldValue {
  if (raw === null) return null;
  if (typeof raw === 'string') return raw.trim() || null;
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'boolean') return raw;
  if (raw instanceof Date) {
    const y = raw.getUTCFullYear();
    const m = String(raw.getUTCMonth() + 1).padStart(2, '0');
    const d = String(raw.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return null;
}

// ── Helpers de range A1 ──────────────────────────────────────────────────────

function colLetterToNum(col: string): number {
  let n = 0;
  for (const ch of col.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n;
}

function parseAddress(addr: string): { row: number; col: number } {
  const m = /^([A-Z]+)(\d+)$/i.exec(addr);
  if (!m) throw new Error(`Referência de célula inválida: ${addr}`);
  return { col: colLetterToNum(m[1]!), row: parseInt(m[2]!, 10) };
}

function parseRange(range: string): {
  startCol: number;
  startRow: number;
  endCol: number;
  endRow: number;
} {
  const parts = range.split(':');
  if (parts.length !== 2) throw new Error(`Intervalo inválido: ${range}`);
  const start = parseAddress(parts[0]!);
  const end = parseAddress(parts[1]!);
  return {
    startCol: start.col,
    startRow: start.row,
    endCol: end.col,
    endRow: end.row,
  };
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
  if (value instanceof Date) {
    // Fórmulas que o ExcelJS não avalia (ex.: dynamic-array LET) podem cachear
    // o resultado como Invalid Date. Tratamos como célula vazia — nunca como
    // "NaN-NaN-NaN". O dado real deve vir de uma célula-fonte avaliável.
    return Number.isNaN(value.getTime()) ? null : value;
  }
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
