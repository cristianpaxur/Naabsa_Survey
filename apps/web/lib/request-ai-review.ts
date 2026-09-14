import 'server-only';
import { randomUUID } from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { enqueueAiReview } from '@/lib/queue';
import type { AiReviewState } from '@/lib/ai-review';

/** Chamador deve autenticar e autorizar o relatório antes de usar o service role. */
export async function requestAiReview(reportId: string): Promise<void> {
  const svc = createServiceClient();
  const { data, error } = await svc.from('reports').select('data_revision, ai_review, status').eq('id', reportId).single();
  if (error || !data) throw new Error('Não foi possível consultar a revisão de IA.');
  const row = data as unknown as { data_revision: number; ai_review: AiReviewState | null; status: string };
  if (!['extracted', 'in_review'].includes(row.status)) throw new Error('Relatório fora da etapa de revisão.');
  if (row.ai_review && ['queued', 'running'].includes(row.ai_review.status)
    && Date.now() - Date.parse(row.ai_review.updatedAt ?? '') < 120_000) return;
  const runId = randomUUID();
  // O worker é a autoridade da flag: até ele responder, estado é apenas enfileirado.
  const state = { ...row.ai_review, status: 'queued', runId, revision: row.data_revision, updatedAt: new Date().toISOString(), error: undefined };
  let claim = svc.from('reports').update({ ai_review: state } as never).eq('id', reportId)
    .eq('data_revision', row.data_revision).in('status', ['extracted', 'in_review']);
  claim = row.ai_review?.runId ? claim.eq('ai_review->>runId', row.ai_review.runId) : claim.is('ai_review->>runId', null);
  const { data: changed, error: updateError } = await claim.select('id').maybeSingle();
  if (updateError) throw new Error('Não foi possível solicitar a revisão de IA.');
  if (!changed) return;
  try {
    const id = await enqueueAiReview({ reportId, dataRevision: row.data_revision, runId });
    if (!id) throw new Error('enqueue_failed');
  } catch {
    await svc.from('reports').update({ ai_review: { ...state, status: 'error', error: 'Não foi possível enviar a análise à fila. Tente novamente.', updatedAt: new Date().toISOString() } } as never)
      .eq('id', reportId).eq('data_revision', row.data_revision).eq('ai_review->>runId', runId).eq('ai_review->>status', 'queued');
    throw new Error('Não foi possível enviar a análise à fila. Tente novamente.');
  }
}
