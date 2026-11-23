import type { FieldDef, FieldValue, NumberFormatMap } from './types';

export type { NumberFormatMap } from './types';

const MAX_DISPLAY_DECIMALS = 100;

function isDisplayDecimals(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_DISPLAY_DECIMALS
  );
}

/**
 * Infere as casas efetivamente exibidas por uma célula numérica do Excel.
 * Retorna `undefined` para formatos gerais, ambíguos ou fora do limite técnico.
 */
export function inferExcelDisplayDecimals(
  numFmt: string | undefined,
  value: number,
): number | undefined {
  if (!numFmt || !Number.isFinite(value)) return undefined;

  const parsed = cleanFormatSections(numFmt);
  if (parsed.hasNumericCondition) return undefined;
  const sections = parsed.sections;
  const section =
    value < 0
      ? (sections[1] ?? sections[0])
      : value === 0
        ? (sections[2] ?? sections[0])
        : sections[0];
  if (!section || section.trim().toLowerCase() === 'general') return undefined;

  if (/[eE][+-]?[0#?]/.test(section)) return undefined;
  const numericPattern = section;
  const decimalIndex = numericPattern.indexOf('.');
  const integerPattern =
    decimalIndex >= 0 ? numericPattern.slice(0, decimalIndex) : numericPattern;
  if (!/[0#?]/.test(integerPattern)) return undefined;
  if (decimalIndex < 0) return 0;

  const fractionPattern = numericPattern.slice(decimalIndex + 1);
  const placeholders = fractionPattern.match(/[0#?]/g) ?? [];
  const maximum = placeholders.length;
  if (maximum > MAX_DISPLAY_DECIMALS) return undefined;
  if (maximum === 0) return 0;

  let minimum = 0;
  for (let index = 0; index < placeholders.length; index++) {
    if (placeholders[index] === '0') minimum = index + 1;
  }

  const percentCount = (section.match(/%/g) ?? []).length;
  const lastPlaceholder = Math.max(
    numericPattern.lastIndexOf('0'),
    numericPattern.lastIndexOf('#'),
    numericPattern.lastIndexOf('?'),
  );
  const scaleCount = (
    numericPattern.slice(lastPlaceholder + 1).match(/,/g) ?? []
  ).length;
  const displayedValue =
    (Math.abs(value) * 100 ** percentCount) / 1000 ** scaleCount;
  if (!Number.isFinite(displayedValue)) return undefined;
  const fraction = displayedValue.toFixed(maximum).split('.')[1] ?? '';
  const lastNonZero = fraction.search(/[^0](?=0*$)/);
  const significant = lastNonZero < 0 ? 0 : lastNonZero + 1;

  const inferred = Math.max(minimum, significant);
  return isDisplayDecimals(inferred) ? inferred : undefined;
}

/** Resolve a precisão efetiva: operador → Excel → spec → representação padrão. */
export function resolveDisplayDecimals(
  field: string,
  def: FieldDef,
  extracted: NumberFormatMap,
  operator: NumberFormatMap,
  overrides: Record<string, FieldValue>,
): number | undefined {
  if (def.type !== 'number') return undefined;

  const override = overrides[field];
  if (
    typeof override === 'number' &&
    Number.isFinite(override) &&
    isDisplayDecimals(operator[field])
  ) {
    return operator[field];
  }
  if (isDisplayDecimals(extracted[field])) return extracted[field];
  if (isDisplayDecimals(def.decimals)) return def.decimals;
  return undefined;
}

/** Formata sem localidade implícita; agrupamento usa vírgula e decimal usa ponto. */
export function formatNumberWithDecimals(
  value: number,
  decimals?: number,
  grouped = false,
): string {
  const formatted = isDisplayDecimals(decimals)
    ? value.toFixed(decimals)
    : String(value);
  if (!grouped || /[eE]/.test(formatted)) return formatted;

  const sign = formatted.startsWith('-') ? '-' : '';
  const unsigned = sign ? formatted.slice(1) : formatted;
  const [integer, fraction] = unsigned.split('.');
  const groupedInteger = integer!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${groupedInteger}${fraction === undefined ? '' : `.${fraction}`}`;
}

/**
 * Divide o formato sem deixar `;` literais criarem seções e remove elementos
 * sem semântica numérica (aspas, escapes, preenchimento e diretivas).
 */
function cleanFormatSections(numFmt: string): {
  sections: string[];
  hasNumericCondition: boolean;
} {
  const sections = [''];
  let quoted = false;
  let bracketed = false;
  let bracketContent = '';
  let hasNumericCondition = false;

  for (let index = 0; index < numFmt.length; index++) {
    const char = numFmt[index]!;
    if (quoted) {
      if (char === '"') quoted = false;
      continue;
    }
    if (bracketed) {
      if (char === ']') {
        bracketed = false;
        if (isNumericCondition(bracketContent)) hasNumericCondition = true;
      } else {
        bracketContent += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === '[') {
      bracketed = true;
      bracketContent = '';
      continue;
    }
    if (char === '\\' || char === '_' || char === '*') {
      index++;
      continue;
    }
    if (char === ';') {
      sections.push('');
      continue;
    }
    sections[sections.length - 1] += char;
  }

  return { sections, hasNumericCondition };
}

function isNumericCondition(directive: string): boolean {
  return /^\s*(?:<=|>=|<>|=|<|>)\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?\s*$/i.test(
    directive,
  );
}
