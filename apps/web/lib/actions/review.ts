'use server';

/**
 * Server Actions da tela de Revisão de Dados (implementação 006).
 *
 * setOverride  — grava operator_overrides[field] (nunca extracted_data),
 *               audita before/after e revalida com validate() do core.
 * confirmData  — defesa server-side (rejeita se houver issue de nível 'error');
 *               mantém in_review e segue para a etapa de fotos.
 */
import { createClient } from '@/lib/supabase/server';
import { audit } from '@/lib/audit';
import { mergeReviewIssues, type AiReviewState } from '@/lib/ai-review';
import { requestAiReview } from '@/lib/request-ai-review';
import { resolveEffectiveNumberFormats } from '@/lib/effective-values';
import { resolveDisplayDecimals, type NumberFormatMap } from '@naabsa/core/number-format';
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
  | {
      issues: Issue[];
      aiReview: AiReviewState | null;
      revision: number;
      savedField?: { value: FieldValue; displayDecimals?: number; isOverride: boolean };
    }
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
  extracted_number_formats: NumberFormatMap | null;
  operator_number_formats: NumberFormatMap | null;
  extraction_issues: Issue[] | null;
  ai_review: AiReviewState | null;
  data_revision: number;
  spec: ReportSpec;
}

async function fetchReport(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reportId: string,
): Promise<ReportRow | null> {
  const { data } = await supabase
    .from('reports')
    .select(
      'id, status, variant, extracted_data, operator_overrides, extracted_number_formats, operator_number_formats, extraction_issues, ai_review, data_revision, report_specs!reports_spec_id_fkey(spec)',
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
    extracted_number_formats: NumberFormatMap | null;
    operator_number_formats: NumberFormatMap | null;
    extraction_issues: Issue[] | null;
    ai_review: AiReviewState | null;
    data_revision: number;
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
    extracted_number_formats: raw.extracted_number_formats,
    operator_number_formats: raw.operator_number_formats,
    extraction_issues: raw.extraction_issues,
    ai_review: raw.ai_review,
    data_revision: raw.data_revision,
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
  decimals?: number,
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
  if (decimals !== undefined && (fieldDef[1].type !== 'number' || !Number.isInteger(decimals) || decimals < 0 || decimals > 100)) {
    return { error: 'As casas decimais devem ser um inteiro de 0 a 100 e só podem ser definidas para campos numéricos.' };
  }
  if (fieldDef[1].type === 'number' && value !== null && (typeof value !== 'number' || !Number.isFinite(value))) {
    return { error: 'Informe um número válido para este campo.' };
  }

  const newOverrides: Record<string, FieldValue> = {
    ...currentOverrides,
    [field]: value,
  };
  const previousFormat = report.operator_number_formats?.[field] ?? null;
  const newFormats: NumberFormatMap = { ...report.operator_number_formats };
  if (value !== null && decimals !== undefined) newFormats[field] = decimals;
  else delete newFormats[field];

  // Valor e formato são persistidos juntos, sob a mesma revisão.
  const { data: updated, error: updateError } = await supabase
    .from('reports')
    .update({ operator_overrides: newOverrides, operator_number_formats: newFormats } as never)
    .eq('id', reportId).eq('status', 'in_review').eq('data_revision', report.data_revision)
    .select('data_revision, ai_review, extraction_issues').maybeSingle();

  if (updateError) {
    return { error: 'Falha ao gravar o override.' };
  }
  if (!updated) return { error: 'Os dados mudaram em outra edição. Recarregue antes de tentar novamente.' };

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
      beforeFormat: previousFormat,
      afterFormat: newFormats[field] ?? null,
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
  const latest = updated as unknown as { data_revision: number; ai_review: AiReviewState | null; extraction_issues: Issue[] | null };
  const numberFormats = resolveEffectiveNumberFormats(
    report.spec, report.variant, report.extracted_number_formats ?? {}, newFormats, newOverrides,
  );
  const issues = mergeReviewIssues(validate(effective, report.spec, report.variant), latest.extraction_issues, effective, extracted, latest.ai_review, numberFormats);

  return {
    issues, aiReview: latest.ai_review, revision: latest.data_revision,
    savedField: {
      value: effective[field] ?? null,
      displayDecimals: resolveDisplayDecimals(field, fieldDef[1], report.extracted_number_formats ?? {}, newFormats, newOverrides),
      isOverride: value !== null,
    },
  };
}

/** Polling lê só avisos/estado: não substitui entradas que o operador está editando. */
export async function getReviewStatus(reportId: string): Promise<SetOverrideResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Sessão expirada. Faça login novamente.' };
  const report = await fetchReport(supabase, reportId);
  if (!report) return { error: 'Não foi possível atualizar a revisão.' };
  const extracted = report.extracted_data ?? {};
  const effective = effectiveData(report.spec, report.variant, extracted, report.operator_overrides ?? {});
  const numberFormats = resolveEffectiveNumberFormats(
    report.spec, report.variant, report.extracted_number_formats ?? {},
    report.operator_number_formats ?? {}, report.operator_overrides ?? {},
  );
  return {
    issues: mergeReviewIssues(validate(effective, report.spec, report.variant), report.extraction_issues, effective, extracted, report.ai_review, numberFormats),
    aiReview: report.ai_review, revision: report.data_revision,
  };
}

export async function retryAiReview(reportId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Sessão expirada. Faça login novamente.' };
  const report = await fetchReport(supabase, reportId);
  if (!report || !['extracted', 'in_review'].includes(report.status)) return { error: 'Relatório indisponível para revisão.' };
  try { await requestAiReview(reportId); return { ok: true }; }
  catch { return { error: 'Não foi possível solicitar a revisão por IA. Tente novamente.' }; }
}

// ── confirmData ─────────────────────────────────────────────────────────────

/**
 * Confirma os dados da revisão (defesa server-side: rejeita se houver issue de
 * nível 'error' — CA-004). NÃO transiciona o estado: a alocação de fotos faz
 * parte da etapa in_review e a transição in_review → editing ocorre só ao avançar
 * pela tela de fotos (advance, implementação 007). Segue para /photos.
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

  // Mantém in_review (fotos fazem parte da revisão). Audita a confirmação.
  await audit(supabase, {
    reportId,
    actor: user.id,
    action: 'data_confirmed',
    payload: null,
  });

  return { ok: true };
}
