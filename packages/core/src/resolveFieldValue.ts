/**
 * Valor efetivo de um campo = `operator_overrides[field] ?? extracted_data[field]`
 * (PRD RF-13). Função ÚNICA usada em todo o sistema (revisão, document-builder,
 * print) para resolver a proveniência de um valor.
 *
 * Mantém overrides falsy legítimos (0, '', false) — só cai no extraído quando o
 * override é `undefined` (ausente) ou `null`.
 */
import type { FieldValue } from './types';

export function resolveFieldValue(
  field: string,
  overrides: Record<string, FieldValue>,
  extracted: Record<string, FieldValue>,
): FieldValue {
  const override = overrides[field];
  if (override !== undefined && override !== null) return override;
  return extracted[field] ?? null;
}
