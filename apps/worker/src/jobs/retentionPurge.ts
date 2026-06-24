/**
 * Job `retention_purge` — implementação 010/T-001 (RF-31).
 *
 * Cron diário: relatórios `generated` cujo ÚLTIMO PDF foi gerado há mais de 30
 * dias têm os blobs derivados (fotos original/processada/thumb, planilha, prints
 * das abas, preview) apagados do Storage — mantendo os PDFs finais, o .docx e os
 * dados. Status → `purged` + `purged_at`. Idempotente (blob ausente não falha).
 *
 * A janela conta do ÚLTIMO PDF (audit `pdf_generated`), conforme spec 010 §6.4.
 */
import { getServiceClient } from '../lib/supabase';

export const RETENTION_PURGE_QUEUE = 'retention_purge';
export const RETENTION_DAYS = 30;
/** Cron diário às 03:00 (horário do worker). */
export const RETENTION_PURGE_CRON = '0 3 * * *';

const BUCKET = 'reports';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Elegível: gerado e com o último PDF há mais de `days` dias (pura, testável). */
export function isEligibleForPurge(
  lastPdfAtIso: string | null,
  nowMs: number,
  days = RETENTION_DAYS,
): boolean {
  if (!lastPdfAtIso) return false;
  const pdfMs = Date.parse(lastPdfAtIso);
  if (!Number.isFinite(pdfMs)) return false;
  return nowMs - pdfMs > days * DAY_MS;
}

/** Lista e remove todos os arquivos sob um prefixo. Retorna quantos removeu. */
async function removePrefix(
  svc: ReturnType<typeof getServiceClient>,
  prefix: string,
): Promise<number> {
  const { data } = await svc.storage.from(BUCKET).list(prefix, { limit: 1000 });
  // Itens com `id` são arquivos (subpastas vêm com id null).
  const files = (data ?? []).filter((f) => (f as { id: string | null }).id !== null);
  if (files.length === 0) return 0;
  await svc.storage.from(BUCKET).remove(files.map((f) => `${prefix}/${f.name}`));
  return files.length;
}

export async function retentionPurge(): Promise<void> {
  const svc = getServiceClient();
  const now = Date.now();

  const { data: gens } = await svc.from('reports').select('id').eq('status', 'generated');
  const reports = (gens ?? []) as { id: string }[];
  let purged = 0;

  for (const r of reports) {
    // Timestamp do último PDF gerado (não há coluna generated_at — fica no audit).
    const { data: lastPdf } = await svc
      .from('audit_log')
      .select('created_at')
      .eq('report_id', r.id)
      .eq('action', 'pdf_generated')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastPdfAt = (lastPdf as { created_at: string } | null)?.created_at ?? null;
    if (!isEligibleForPurge(lastPdfAt, now)) continue;

    // Remove blobs derivados; preserva final*.pdf e final.docx (raiz de {id}/).
    let removed = 0;
    for (const sub of ['photos/original', 'photos/processed', 'photos/thumbs', 'sheets']) {
      removed += await removePrefix(svc, `${r.id}/${sub}`);
    }
    await svc.storage
      .from(BUCKET)
      .remove([`${r.id}/spreadsheet.xlsx`, `${r.id}/preview.pdf`])
      .catch(() => {
        /* já ausentes — idempotente */
      });

    // Status → purged (guarda de corrida no status).
    const { error } = await svc
      .from('reports')
      .update({ status: 'purged', purged_at: new Date().toISOString() } as never)
      .eq('id', r.id)
      .eq('status', 'generated');
    if (error) {
      console.error(`[retention_purge] ${r.id} falha ao atualizar:`, error.message);
      continue;
    }

    await svc.from('audit_log').insert({
      report_id: r.id,
      actor: null,
      action: 'retention_purged',
      payload: { removed_blobs: removed, retention_days: RETENTION_DAYS, last_pdf_at: lastPdfAt },
    } as never);
    purged += 1;
    console.log(`[retention_purge] ${r.id} purgado (${removed} blobs removidos).`);
  }

  console.log(`[retention_purge] concluído: ${purged}/${reports.length} relatórios purgados.`);
}
