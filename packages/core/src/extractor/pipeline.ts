/**
 * Orquestrador da extração: extract (aba/fingerprint/coerção) + validate
 * (campo/cruzadas) → { data, issues } completo. É o ponto de entrada que o app
 * usa (impl 005). Em erro de aba/fingerprint, pula a validação (evita ruído de
 * "todos os campos vazios").
 */
import type ExcelJS from 'exceljs';
import type { ReportSpec, ExtractionResult } from '../types';
import { extract } from './extract';
import { validate } from './validate';

const BLOCKING_FIELDS = new Set(['__sheet__', '__fingerprint__']);

export function runExtraction(
  workbook: ExcelJS.Workbook,
  spec: ReportSpec,
  variant: string | null,
): ExtractionResult {
  const ext = extract(workbook, spec, variant);
  const blocked = ext.issues.some((i) => BLOCKING_FIELDS.has(i.field));
  if (blocked) return ext;

  const validationIssues = validate(ext.data, spec, variant);
  return { data: ext.data, issues: [...ext.issues, ...validationIssues] };
}
