import type { FieldValue, Issue } from '@naabsa/core';

export interface AiReviewState {
  status: 'queued' | 'running' | 'done' | 'error' | 'disabled' | 'stale';
  runId?: string;
  revision?: number;
  updatedAt?: string;
  data?: Record<string, FieldValue>;
  dependencies?: Record<string, string[]>;
  error?: string;
}

/** Só reaproveita sugestões cujo campo e dependências ainda têm os valores analisados. */
export function mergeReviewIssues(
  deterministic: Issue[],
  persisted: Issue[] | null | undefined,
  effective: Record<string, FieldValue>,
  extracted: Record<string, FieldValue>,
  state: AiReviewState | null | undefined,
): Issue[] {
  const snapshot = state?.data ?? extracted; // avisos legados analisavam extracted_data
  const unique = new Map<string, Issue>();
  for (const issue of [...deterministic, ...(persisted ?? []).filter((i) => {
    if (i.origin !== 'ai') return false;
    const fields = state?.dependencies?.[i.field] ?? [i.field];
    return [i.field, ...fields].every((f) => Object.hasOwn(snapshot, f) && effective[f] === snapshot[f]);
  })]) {
    unique.set(JSON.stringify([issue.field, issue.level, issue.origin ?? 'validation', issue.message]), issue);
  }
  return [...unique.values()];
}

export function aiReviewLabel(state: AiReviewState | null, now = Date.now()): string {
  if (!state) return 'Revisão por IA ainda não solicitada.';
  const expired = !state.updatedAt || now - Date.parse(state.updatedAt) > 120_000;
  switch (state.status) {
    case 'disabled': return 'Revisão por IA desativada. Você pode seguir com a revisão manual.';
    case 'queued': return expired ? 'A análise aguarda o worker há mais de 2 minutos. Você pode tentar novamente.' : 'Revisão por IA aguardando processamento…';
    case 'running': return expired ? 'A análise está demorando. Verifique o worker ou tente novamente.' : 'IA revisando os dados…';
    case 'done': return 'Revisão por IA concluída.';
    case 'error': return state.error ?? 'A IA não conseguiu revisar os dados. Tente novamente.';
    case 'stale': return 'Dados alterados. Avisos dos campos modificados foram invalidados; você pode analisar novamente.';
  }
}
