/**
 * Coerção de tipos (PRD RF-06). Recebe o valor primitivo já resolvido da célula
 * (o `extract.ts` normaliza a célula do ExcelJS antes de chamar aqui) e converte
 * para o tipo do campo. Determinístico (RNF-01): sem `Date` local nem locale.
 *
 * Política de números-como-texto (pt-BR): `.` é separador de milhar e `,` é
 * decimal — "208.450" → 208450; "1.025,50" → 1025.50.
 * Datas saem em ISO `YYYY-MM-DD` (o `format` do spec é só para exibição).
 */
import type { FieldDef, FieldValue } from '../types';

/** Valor cru de uma célula após normalização do ExcelJS. */
export type RawCellValue = string | number | boolean | Date | null;

export interface CoerceOptions {
  /** Sistema de datas 1904 do workbook (raro). */
  date1904?: boolean;
}

export interface CoerceResult {
  value: FieldValue;
  /** Mensagem pt-BR quando a coerção falha (vira Issue de erro). */
  error?: string;
}

export function isEmptyCell(raw: RawCellValue): boolean {
  if (raw === null) return true;
  if (typeof raw === 'string' && raw.trim() === '') return true;
  // Invalid Date (fórmula não avaliada pelo ExcelJS) conta como vazio.
  if (raw instanceof Date && Number.isNaN(raw.getTime())) return true;
  return false;
}

export function coerceField(
  raw: RawCellValue,
  field: FieldDef,
  opts: CoerceOptions = {},
): CoerceResult {
  if (isEmptyCell(raw)) return { value: null };
  switch (field.type) {
    case 'string':
      return coerceString(raw);
    case 'number':
      return coerceNumber(raw, field.decimals);
    case 'date':
      return coerceDate(raw, opts.date1904 ?? false);
    case 'enum':
      return coerceEnum(raw, field.options);
    case 'boolean':
      return coerceBoolean(raw);
    case 'time':
      return coerceTime(raw);
  }
}

function coerceString(raw: RawCellValue): CoerceResult {
  if (raw instanceof Date) return { value: dateToISO(raw) };
  return { value: String(raw).trim() };
}

function coerceNumber(raw: RawCellValue, decimals?: number): CoerceResult {
  let n: number;
  if (typeof raw === 'number') {
    n = raw;
  } else if (typeof raw === 'boolean' || raw instanceof Date) {
    return { value: null, error: `Valor não numérico: '${describe(raw)}'.` };
  } else {
    const cleaned = String(raw)
      .trim()
      .replace(/\s/g, '')
      .replace(/\./g, '')
      .replace(',', '.');
    n = Number(cleaned);
    if (!Number.isFinite(n)) {
      return {
        value: null,
        error: `Valor não numérico: '${String(raw).trim()}'.`,
      };
    }
  }
  if (decimals !== undefined) n = roundTo(n, decimals);
  return { value: n };
}

function coerceDate(raw: RawCellValue, date1904: boolean): CoerceResult {
  if (raw instanceof Date) return { value: dateToISO(raw) };
  if (typeof raw === 'number') {
    if (raw < 0)
      return { value: null, error: `Serial de data inválido: ${raw}.` };
    return { value: excelSerialToISO(raw, date1904) };
  }
  if (typeof raw === 'string') {
    const iso = parseDateString(raw.trim());
    if (iso) return { value: iso };
    return { value: null, error: `Data inválida: '${raw.trim()}'.` };
  }
  return { value: null, error: 'Data inválida.' };
}

function coerceEnum(raw: RawCellValue, options: string[]): CoerceResult {
  const s = String(raw).trim();
  const match = options.find((o) => o.toLowerCase() === s.toLowerCase());
  if (match !== undefined) return { value: match };
  return {
    value: s,
    error: `Valor '${s}' fora das opções: ${options.join(', ')}.`,
  };
}

const TRUTHY = new Set([
  'sim',
  's',
  'yes',
  'y',
  'true',
  'verdadeiro',
  '1',
  'x',
]);
const FALSY = new Set(['não', 'nao', 'n', 'no', 'false', 'falso', '0']);

function coerceBoolean(raw: RawCellValue): CoerceResult {
  if (typeof raw === 'boolean') return { value: raw };
  if (typeof raw === 'number') {
    if (raw === 1) return { value: true };
    if (raw === 0) return { value: false };
    return { value: null, error: `Booleano inválido: ${raw}.` };
  }
  const s = String(raw).trim().toLowerCase();
  if (TRUTHY.has(s)) return { value: true };
  if (FALSY.has(s)) return { value: false };
  return { value: null, error: `Booleano inválido: '${String(raw).trim()}'.` };
}

// ── Helpers ──

function roundTo(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function dateToISO(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Serial do Excel → ISO. Base 1899-12-30 corrige o bug do "29/02/1900" para
 * serials ≥ 61 (sistema 1900); base 1904-01-01 para o sistema 1904.
 */
export function excelSerialToISO(serial: number, date1904 = false): string {
  const baseUTC = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const ms = baseUTC + Math.floor(serial) * 86_400_000;
  return dateToISO(new Date(ms));
}

function parseDateString(s: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) {
    const [, y, m, d] = iso;
    if (y && m && d && isValidYMD(+y, +m, +d)) return `${y}-${m}-${d}`;
    return null;
  }
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s); // DD/MM/YYYY (pt-BR)
  if (br) {
    const [, dd, mm, yyyy] = br;
    if (dd && mm && yyyy && isValidYMD(+yyyy, +mm, +dd)) {
      return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
  }
  return null;
}

function isValidYMD(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/**
 * Coerção de horário (RF-011). Converte serial de tempo do Excel (fração de dia),
 * objeto Date (usa horas/minutos UTC) ou string "HH:MM" → "HH:MM".
 * Datetime serials (parte inteira > 0) → usa só a fração.
 */
function coerceTime(raw: RawCellValue): CoerceResult {
  if (raw instanceof Date) {
    const h = String(raw.getUTCHours()).padStart(2, '0');
    const m = String(raw.getUTCMinutes()).padStart(2, '0');
    return { value: `${h}:${m}` };
  }
  if (typeof raw === 'number') {
    const frac = raw - Math.floor(raw); // descarta parte de data se vier junto
    const totalMinutes = Math.round(frac * 24 * 60);
    const h = String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0');
    const m = String(totalMinutes % 60).padStart(2, '0');
    return { value: `${h}:${m}` };
  }
  if (typeof raw === 'string') {
    const s = raw.trim();
    const match = /(\d{1,2}):(\d{2})/.exec(s);
    if (match) {
      const [, hh, mm] = match;
      return { value: `${hh!.padStart(2, '0')}:${mm}` };
    }
    return { value: null, error: `Hora inválida: '${s}'.` };
  }
  return { value: null, error: 'Hora inválida.' };
}

function describe(raw: RawCellValue): string {
  if (raw instanceof Date) return dateToISO(raw);
  return String(raw);
}
