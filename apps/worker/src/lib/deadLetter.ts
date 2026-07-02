/**
 * Dead-letter dos jobs de documento (014/T-001, RF-001). Quando a ÚLTIMA
 * tentativa de um job falha, o handler audita o motivo no `audit_log` — é o que
 * a web lê para tirar o operador do beco (retry em `approved`, erro no editor).
 * Padrão espelhado do `markPhotoError` (process_photo).
 */
import { getServiceClient } from './supabase';

/** Ação auditada por fila (a web consulta esses nomes — manter em sincronia). */
export const FAILURE_ACTIONS = {
  generate_pdf: 'pdf_generation_failed',
  preview_pdf: 'preview_failed',
  build_working_docx: 'working_docx_failed',
} as const;

export type FailureQueue = keyof typeof FAILURE_ACTIONS;

/**
 * Registra a falha DEFINITIVA de um job no audit_log. Nunca lança: uma falha
 * ao auditar não pode mascarar o erro original do job (apenas loga).
 */
export async function auditJobFailure(
  queue: FailureQueue,
  reportId: string,
  err: unknown,
  jobId?: string,
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  try {
    const svc = getServiceClient();
    const { error } = await svc.from('audit_log').insert({
      report_id: reportId,
      actor: null,
      action: FAILURE_ACTIONS[queue],
      payload: { message, queue, ...(jobId ? { jobId } : {}) },
    } as never);
    if (error) throw error;
    console.error(`[worker][${queue}] falha definitiva auditada para ${reportId}: ${message}`);
  } catch (auditErr) {
    console.error(
      `[worker][${queue}] falha ao auditar dead-letter de ${reportId}:`,
      auditErr,
      '— erro original:',
      message,
    );
  }
}
