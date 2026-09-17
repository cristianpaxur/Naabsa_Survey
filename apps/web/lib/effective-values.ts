/**
 * Valores efetivos por seção — combina spec congelado + extracted_data +
 * operator_overrides via resolveFieldValue (RF-13, implementação 003).
 *
 * A função `groupBySectionOrdered` retorna os campos agrupados pela ordem
 * de aparição no spec (common.fields primeiro, by_variant[variant] depois),
 * dentro de cada seção preservando a ordem original.
 */
import { resolveFieldValue, type FieldDef, type FieldValue, type ReportSpec } from '@naabsa/core';
import { collectFields } from '@naabsa/core';
import { resolveDisplayDecimals, type NumberFormatMap } from '@naabsa/core/number-format';

export interface EffectiveField {
  /** Chave do campo no spec (ex.: "data_survey"). */
  name: string;
  def: FieldDef;
  /** Valor efetivo = override ?? extracted. */
  value: FieldValue;
  /** Indica que o valor vem de um override do operador. */
  isOverride: boolean;
  displayDecimals?: number;
}

export interface EffectiveSection {
  /** Nome da seção (spec.section). */
  section: string;
  fields: EffectiveField[];
}

/** Mapa de precisão usado para comparar a apresentação atual com o snapshot da IA. */
export function resolveEffectiveNumberFormats(
  spec: ReportSpec,
  variant: string | null,
  extractedFormats: NumberFormatMap,
  operatorFormats: NumberFormatMap,
  overrides: Record<string, FieldValue>,
): NumberFormatMap {
  const formats: NumberFormatMap = {};
  for (const [name, def] of collectFields(spec, variant)) {
    const decimals = resolveDisplayDecimals(name, def, extractedFormats, operatorFormats, overrides);
    if (decimals !== undefined) formats[name] = decimals;
  }
  return formats;
}

/**
 * Agrupa os campos efetivos por seção, respeitando a ordem de aparição no spec.
 *
 * @param spec        Spec congelado do relatório.
 * @param variant     Variante (null se o tipo não tem variantes).
 * @param extracted   reports.extracted_data (JSONB).
 * @param overrides   reports.operator_overrides (JSONB, pode ser null).
 */
export function groupBySectionOrdered(
  spec: ReportSpec,
  variant: string | null,
  extracted: Record<string, FieldValue>,
  overrides: Record<string, FieldValue> | null,
  extractedFormats: NumberFormatMap = {},
  operatorFormats: NumberFormatMap = {},
): EffectiveSection[] {
  const safeOverrides = overrides ?? {};
  const fields = collectFields(spec, variant);

  // Preserva a ordem de inserção (seções aparecem na ordem do spec).
  const sectionMap = new Map<string, EffectiveField[]>();

  for (const [name, def] of fields) {
    const value = resolveFieldValue(name, safeOverrides, extracted);
    const rawOverride = safeOverrides[name];
    const isOverride = rawOverride !== undefined && rawOverride !== null;

    const displayDecimals = resolveDisplayDecimals(name, def, extractedFormats, operatorFormats, safeOverrides);
    const ef: EffectiveField = { name, def, value, isOverride, displayDecimals };

    const section = def.section;
    if (!sectionMap.has(section)) {
      sectionMap.set(section, []);
    }
    sectionMap.get(section)!.push(ef);
  }

  return Array.from(sectionMap.entries()).map(([section, efFields]) => ({
    section,
    fields: efFields,
  }));
}
