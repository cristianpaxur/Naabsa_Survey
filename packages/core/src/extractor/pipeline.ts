/**
 * Orquestrador da extração: extract (aba/fingerprint/coerção) + validate
 * (campo/cruzadas) → { data, issues } completo. É o ponto de entrada que o app
 * usa (impl 005). Em erro de aba/fingerprint, pula a validação (evita ruído de
 * "todos os campos vazios").
 */
import type ExcelJS from 'exceljs';
import type { ReportSpec, ExtractionResult, Issue } from '../types';
import { extract, resolveVariant } from './extract';
import { validate } from './validate';

const BLOCKING_FIELDS = new Set(['__sheet__', '__fingerprint__']);

/**
 * Ponto de entrada da extração (impl 005). Resolve a variante da própria planilha
 * quando o spec define `source.variant_source` (v2, ex.: Draft Survey `Capa!L4`);
 * caso contrário usa a `variant` informada (v1). Em erro de aba/fingerprint pula a
 * validação (evita ruído de "todos os campos vazios").
 */
export function runExtraction(
  workbook: ExcelJS.Workbook,
  spec: ReportSpec,
  variant: string | null = null,
): ExtractionResult {
  const variantIssues: Issue[] = [];
  let effectiveVariant = variant;
  if (spec.source.variant_source) {
    const r = resolveVariant(workbook, spec);
    effectiveVariant = r.variant;
    if (r.issue) variantIssues.push(r.issue);
  }

  const ext = extract(workbook, spec, effectiveVariant);
  const issues = [...variantIssues, ...ext.issues];
  const blocked = issues.some((i) => BLOCKING_FIELDS.has(i.field));
  if (blocked) return { data: ext.data, tables: ext.tables, issues };

  const validationIssues = validate(ext.data, spec, effectiveVariant);
  return { data: ext.data, tables: ext.tables, issues: [...issues, ...validationIssues] };
}
