import type { ServerClient } from './supabase/server';

export interface AuditEntry {
  reportId: string | null;
  actor: string | null; // null = sistema/worker
  action: string;
  payload?: unknown;
}

/**
 * Grava uma linha no audit_log (RF-32). O cliente é passado pelo chamador
 * (server action / route handler) já autenticado.
 */
export async function audit(
  supabase: ServerClient,
  entry: AuditEntry,
): Promise<void> {
  const { error } = await supabase.from('audit_log').insert({
    report_id: entry.reportId,
    actor: entry.actor,
    action: entry.action,
    payload: entry.payload ?? null,
  } as never);
  if (error) throw error;
}
