import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@naabsa/db';
import { audit } from './audit';

export type ReportStatus =
  | 'draft'
  | 'extracted'
  | 'in_review'
  | 'editing'
  | 'approved'
  | 'generated'
  | 'purged';

export const REPORT_STATUSES: ReportStatus[] = [
  'draft',
  'extracted',
  'in_review',
  'editing',
  'approved',
  'generated',
  'purged',
];

/**
 * Grafo de transições (PRD §3.2). Além do fluxo linear, qualquer estado
 * (exceto generated/purged) pode voltar a `draft` (reiniciar com nova planilha).
 * A transição generated→editing (regenerar, RF-30) entra na implementação 010.
 */
export const NEXT_STATES: Record<ReportStatus, ReportStatus[]> = {
  draft: ['extracted'],
  extracted: ['in_review', 'draft'],
  in_review: ['editing', 'draft'],
  editing: ['approved', 'draft'],
  approved: ['generated', 'draft'],
  generated: ['purged'],
  purged: [],
};

export function isValidTransition(
  from: ReportStatus,
  to: ReportStatus,
): boolean {
  return NEXT_STATES[from].includes(to);
}

/**
 * Executa uma transição de status: valida contra o grafo, atualiza o relatório
 * (com guarda otimista no status atual) e audita. Transição inválida lança erro
 * pt-BR e registra a tentativa rejeitada (RF-32).
 */
export async function transition(
  supabase: SupabaseClient<Database>,
  reportId: string,
  from: ReportStatus,
  to: ReportStatus,
  actorId: string | null,
): Promise<void> {
  if (!isValidTransition(from, to)) {
    await audit(supabase, {
      reportId,
      actor: actorId,
      action: 'transition_rejected',
      payload: { from, to },
    });
    throw new Error(`Transição inválida: ${from} → ${to}.`);
  }

  const { error, count } = await supabase
    .from('reports')
    .update({ status: to }, { count: 'exact' })
    .eq('id', reportId)
    .eq('status', from);
  if (error) throw error;
  if (count === 0) {
    throw new Error(
      `Relatório não está em '${from}' (mudou em paralelo?) — transição abortada.`,
    );
  }

  await audit(supabase, {
    reportId,
    actor: actorId,
    action: 'transition',
    payload: { from, to },
  });
}
