/**
 * Detecção PURA de falha definitiva de job pelo audit_log (014/T-003, RF-002/003).
 *
 * O worker audita `*_failed` quando a última tentativa esgota (lib/deadLetter do
 * worker); a web audita `*_enqueued` a cada enfileiramento. O job mais recente
 * define o estado: se o último evento entre os dois for a falha, o job morreu e
 * a UI deve oferecer a retentativa; se for um novo enfileiramento, a falha
 * anterior está superada e o polling segue normal.
 */

export interface AuditEventRow {
  action: string;
  payload: { message?: string } | null;
}

export interface JobOutcome {
  failed: boolean;
  reason?: string;
}

/**
 * Decide o estado do job a partir das linhas do audit_log em ordem
 * DECRESCENTE de criação (mais recente primeiro).
 */
export function latestJobOutcome(
  rows: AuditEventRow[],
  enqueuedAction: string,
  failedAction: string,
): JobOutcome {
  for (const row of rows) {
    if (row.action === enqueuedAction) return { failed: false };
    if (row.action === failedAction) {
      return { failed: true, reason: row.payload?.message };
    }
  }
  return { failed: false };
}
