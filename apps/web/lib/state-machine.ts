import type { ServerClient } from './supabase/server';
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
 * `editing → in_review` permite revisar as fotos novamente sem remover o
 * documento de trabalho. `generated → editing` é a regeneração (RF-30,
 * 010/T-004): reabre para editar e gerar uma nova versão do PDF, mantendo o
 * `working.docx`.
 */
export const NEXT_STATES: Record<ReportStatus, ReportStatus[]> = {
  draft: ['extracted'],
  extracted: ['in_review', 'draft'],
  in_review: ['editing', 'draft'],
  editing: ['approved', 'in_review', 'draft'],
  approved: ['generated', 'draft'],
  generated: ['editing', 'purged'],
  purged: [],
};

export function isValidTransition(
  from: ReportStatus,
  to: ReportStatus,
): boolean {
  return NEXT_STATES[from].includes(to);
}

export interface TransitionOptions {
  clearWopiLock?: boolean;
}

/**
 * Executa uma transição de status: valida contra o grafo, atualiza o relatório
 * (com guarda otimista no status atual) e audita. Transição inválida lança erro
 * pt-BR e registra a tentativa rejeitada (RF-32).
 */
export async function transition(
  supabase: ServerClient,
  reportId: string,
  from: ReportStatus,
  to: ReportStatus,
  actorId: string | null,
  options: TransitionOptions = {},
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
    .update({
      status: to,
      ...(options.clearWopiLock
        ? { wopi_lock: null, wopi_lock_expires_at: null }
        : {}),
    } as never, { count: 'exact' })
    .eq('id', reportId)
    .eq('status', from)
    .is('deleted_at', null);
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
