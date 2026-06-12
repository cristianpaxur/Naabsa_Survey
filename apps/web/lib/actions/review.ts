'use server';

/**
 * Server Actions da tela de Revisão de Dados (implementação 006).
 *
 * setOverride  — grava operator_overrides[field] (nunca extracted_data),
 *               audita before/after e revalida com validate() do core.
 * confirmData  — transiciona in_review → editing após defesa server-side
 *               (rejeita se houver issue de nível 'error').
 */
import { createClient } from '@/lib/supabase/server';
import { audit } from '@/lib/audit';
import { transition } from '@/lib/state-machine';
import {
  validate,
  resolveFieldValue,
  collectFields,
  type Issue,
  type ReportSpec,
  type FieldValue,
} from '@naabsa/core';

// ── Tipos compartilhados ────────────────────────────────────────────────────

export type SetOverrideResult =
  | { issues: Issue[] }
  | { error: string };

export type ConfirmDataResult =
  | { ok: true }
  | { error: string };

// ── Helpers internos ────────────────────────────────────────────────────────

interface ReportRow {
  id: string;
  status: string;
  variant: string | null;
  extracted_data: Record<string, FieldValue> | null;
  operator_overrides: Record<string, FieldValue> | null;
  spec: ReportSpec;
}

async function fetchReport(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reportId: string,
): Promise<ReportRow | null> {
  const { data } = await supabase
    .from('reports')
    .select(
      'id, status, variant, extracted_data, operator_overrides, report_specs!reports_spec_id_fkey(spec)',
    )
    .eq('id', reportId)
    .single();

  if (!data) return null;

  // supabase-js retorna o join como objeto (ou array) em report_specs
  const raw = data as unknown as {
    id: string;
    status: string;
    variant: string | null;
    extracted_data: Record<string, FieldValue> | null;
    operator_overrides: Record<string, FieldValue> | null;
    report_specs: { spec: ReportSpec } | { spec: ReportSpec }[] | null;
  };

  let spec: ReportSpec | null = null;
  if (raw.report_specs) {
    const rs = Array.isArray(raw.report_specs)
      ? raw.report_specs[0]
      : raw.report_specs;
    spec = rs?.spec ?? null;
  }
  if (!spec) return null;

  return {
    id: raw.id,
    status: raw.status,
    variant: raw.variant,
    extracted_data: raw.extracted_data,
    operator_overrides: raw.operator_overrides,
    spec,
  };
}

/** Resolve valores efetivos com overrides aplicados (RF-13). */
function effectiveData(
  spec: ReportSpec,
  variant: string | null,
  extracted: Record<string, FieldValue>,
  overrides: Record<string, FieldValue>,
): Record<string, FieldValue> {
  const fields = collectFields(spec, variant);
  const result: Record<string, FieldValue> = {};
  for (const [name] of fields) {
    result[name] = resolveFieldValue(name, overrides, extracted);
  }
  return result;
}

// ── setOverride ─────────────────────────────────────────────────────────────

/**
 * Grava `operator_overrides[field] = value` no relatório.
 * Audita before/after e revalida, retornando as issues atualizadas.
 *
 * CA-002: nunca toca em extracted_data.
 * CA-003: cada chamada gera linha de auditoria com before/after.
 */
export async function setOverride(
  reportId: string,
  field: string,
  value: FieldValue,
): Promise<SetOverrideResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sessão expirada. Faça login novamente.' };

  const report = await fetchReport(supabase, reportId);
  if (!report) return { error: 'Relatório não encontrado.' };
  if (report.status !== 'in_review') {
    return { error: 'Relatório não está em revisão.' };
  }

  const currentOverrides = report.operator_overrides ?? {};
  const previousValue = currentOverrides[field] ?? null;

  // Verificar se o campo existe no spec
  const fields = collectFields(report.spec, report.variant);
  const fieldDef = fields.find(([name]) => name === field);
  if (!fieldDef) {
    return { error: `Campo '${field}' não encontrado no spec.` };
  }

  const newOverrides: Record<string, FieldValue> = {
    ...currentOverrides,
    [field]: value,
  };

  // Atualiza operator_overrides (NUNCA extracted_data)
  const { error: updateError } = await supabase
    .from('reports')
    .update({ operator_overrides: newOverrides } as never)
    .eq('id', reportId);

  if (updateError) {
    return { error: 'Falha ao gravar o override.' };
  }

  // Auditoria before/after (CA-003)
  await audit(supabase, {
    reportId,
    actor: user.id,
    action: 'override',
    payload: {
      field,
      cell: fieldDef[1].cell,
      before: previousValue,
      after: value,
    },
  });

  // Revalidar com valores efetivos
  const extracted = report.extracted_data ?? {};
  const effective = effectiveData(
    report.spec,
    report.variant,
    extracted,
    newOverrides,
  );
  const issues = validate(effective, report.spec, report.variant);

  return { issues };
}

// ── confirmData ─────────────────────────────────────────────────────────────

/**
 * Confirma os dados e transiciona in_review → editing.
 * Defesa server-side: rejeita se houver qualquer issue de nível 'error'
 * (CA-004 — segurança além da UI).
 */
export async function confirmData(
  reportId: string,
): Promise<ConfirmDataResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sessão expirada. Faça login novamente.' };

  const report = await fetchReport(supabase, reportId);
  if (!report) return { error: 'Relatório não encontrado.' };
  if (report.status !== 'in_review') {
    return { error: 'Relatório não está em revisão.' };
  }

  // Defesa server-side: revalida com valores efetivos
  const extracted = report.extracted_data ?? {};
  const overrides = report.operator_overrides ?? {};
  const effective = effectiveData(
    report.spec,
    report.variant,
    extracted,
    overrides,
  );
  const issues = validate(effective, report.spec, report.variant);
  const hasErrors = issues.some((i) => i.level === 'error');
  if (hasErrors) {
    return {
      error:
        'Há erros bloqueantes nos dados. Corrija-os antes de confirmar.',
    };
  }

  // Transição in_review → editing (auditada pela máquina de estados)
  try {
    await transition(supabase, reportId, 'in_review', 'editing', user.id);
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : 'Falha na transição de estado.',
    };
  }

  return { ok: true };
}
