/**
 * Validações de campo e cruzadas (PRD RF-07, RF-08) → Issue[] em pt-BR.
 *
 * Por campo (nível `error`): required (vazio), min/max (numérico), pattern
 * (regex). A pertinência de `enum` já é checada na coerção. Regras cruzadas
 * (`spec.validations`): `compare` e `range`, cada uma com o seu nível/mensagem.
 */
import type {
  ReportSpec,
  Issue,
  IssueLevel,
  FieldValue,
  FieldDef,
  ValidationRule,
  CompareOp,
} from '../types';
import { collectFields } from './extract';

export function validate(
  data: Record<string, FieldValue>,
  spec: ReportSpec,
  variant: string | null,
): Issue[] {
  const issues: Issue[] = [];
  const fields = collectFields(spec, variant);
  const cellOf = new Map<string, string>(fields.map(([n, f]) => [n, f.cell]));

  for (const [name, field] of fields) {
    issues.push(...validateField(name, field, data[name] ?? null));
  }
  for (const rule of spec.validations ?? []) {
    const issue = validateRule(rule, data, cellOf);
    if (issue) issues.push(issue);
  }
  return issues;
}

function mk(
  field: string,
  cell: string | null,
  level: IssueLevel,
  message: string,
): Issue {
  return { field, cell, level, message, origin: 'validation' };
}

function validateField(name: string, field: FieldDef, v: FieldValue): Issue[] {
  const out: Issue[] = [];
  const empty = v === null || v === '';

  if (field.required && empty) {
    out.push(
      mk(
        name,
        field.cell,
        'error',
        `Campo '${field.label}' vazio na célula ${field.cell}.`,
      ),
    );
    return out;
  }
  if (empty) return out;

  if (typeof v === 'number') {
    if (field.min !== undefined && v < field.min) {
      out.push(
        mk(
          name,
          field.cell,
          'error',
          `Campo '${field.label}' abaixo do mínimo (${field.min}) na célula ${field.cell}.`,
        ),
      );
    }
    if (field.max !== undefined && v > field.max) {
      out.push(
        mk(
          name,
          field.cell,
          'error',
          `Campo '${field.label}' acima do máximo (${field.max}) na célula ${field.cell}.`,
        ),
      );
    }
  }

  if (typeof v === 'string' && field.pattern !== undefined) {
    const re = safeRegExp(field.pattern);
    if (re && !re.test(v)) {
      out.push(
        mk(
          name,
          field.cell,
          'error',
          `Campo '${field.label}' não corresponde ao formato esperado na célula ${field.cell}.`,
        ),
      );
    }
  }

  return out;
}

function validateRule(
  rule: ValidationRule,
  data: Record<string, FieldValue>,
  cellOf: Map<string, string>,
): Issue | null {
  if (rule.rule === 'compare') {
    const a = data[rule.left] ?? null;
    const b = data[rule.right] ?? null;
    if (a === null || b === null) return null; // não comparável → silencioso
    if (!compareOk(a, b, rule.op)) {
      return mk(
        rule.left,
        cellOf.get(rule.left) ?? null,
        rule.level,
        rule.message,
      );
    }
    return null;
  }
  // range
  const v = data[rule.field] ?? null;
  if (typeof v !== 'number') return null;
  if (
    (rule.min !== undefined && v < rule.min) ||
    (rule.max !== undefined && v > rule.max)
  ) {
    return mk(
      rule.field,
      cellOf.get(rule.field) ?? null,
      rule.level,
      rule.message,
    );
  }
  return null;
}

function compareOk(a: FieldValue, b: FieldValue, op: CompareOp): boolean {
  let cmp: number;
  if (typeof a === 'number' && typeof b === 'number') {
    cmp = a < b ? -1 : a > b ? 1 : 0;
  } else {
    // Strings ISO (YYYY-MM-DD) ordenam corretamente por comparação textual.
    const as = String(a);
    const bs = String(b);
    cmp = as < bs ? -1 : as > bs ? 1 : 0;
  }
  switch (op) {
    case '>=':
      return cmp >= 0;
    case '<=':
      return cmp <= 0;
    case '>':
      return cmp > 0;
    case '<':
      return cmp < 0;
    case '==':
      return cmp === 0;
    case '!=':
      return cmp !== 0;
  }
}

function safeRegExp(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}
