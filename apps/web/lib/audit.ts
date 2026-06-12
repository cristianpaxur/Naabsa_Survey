import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@naabsa/db';

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
  supabase: SupabaseClient<Database>,
  entry: AuditEntry,
): Promise<void> {
  const row = {
    report_id: entry.reportId,
    actor: entry.actor,
    action: entry.action,
    payload: (entry.payload ??
      null) as Database['public']['Tables']['audit_log']['Insert']['payload'],
  };
  const { error } = await supabase.from('audit_log').insert(row);
  if (error) throw error;
}
