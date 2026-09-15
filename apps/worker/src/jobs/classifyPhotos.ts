/**
 * Job `classify_photos` — implementação 010/T-008 (RF-37), atrás de `AI_ENABLED`.
 *
 * Pós-processamento: para cada foto PROCESSADA ainda não alocada, pede ao modelo
 * (visão) o slot mais provável + flags de qualidade (`dark`/`blurry`). Pré-aloca
 * com `ai_suggested=true` (respeitando o `max` do slot); slot inexistente é
 * descartado. Nunca envia a foto ORIGINAL (RF-38). Falha não bloqueia (RNF-06).
 */
import { randomUUID } from 'node:crypto';
import { getServiceClient } from '../lib/supabase';
import type { ReportSpec, PhotoSlot } from '@naabsa/core';
import {
  callLLM,
  isAiEnabled,
  parseJsonFromText,
  type AiDeps,
} from '../lib/llm';

export const CLASSIFY_PHOTOS_QUEUE = 'classify_photos';
export interface ClassifyPhotosPayload {
  reportId: string;
  photoId?: string;
  runId?: string;
}

export interface ClassifyPhotosExecution {
  jobId: string;
  retryCount: number;
}

const BUCKET = 'reports';
const VALID_FLAGS = new Set(['dark', 'blurry', 'possible_duplicate']);

export interface PhotoSuggestion {
  slotId: string | null;
  flags: string[];
}

/** Interpreta a resposta da IA: slot VÁLIDO (ou null) + flags conhecidas (puro). */
export function interpretSuggestion(
  parsed: unknown,
  validSlots: Set<string>,
): PhotoSuggestion {
  const r = (parsed ?? {}) as { slot_id?: unknown; flags?: unknown };
  const slotId =
    typeof r.slot_id === 'string' && validSlots.has(r.slot_id)
      ? r.slot_id
      : null;
  const flags = Array.isArray(r.flags)
    ? [
        ...new Set(
          r.flags.filter(
            (f): f is string => typeof f === 'string' && VALID_FLAGS.has(f),
          ),
        ),
      ]
    : [];
  return { slotId, flags };
}

function buildPrompt(slots: PhotoSlot[]): string {
  const list = slots.map((s) => `- ${s.id}: ${s.label}`).join('\n');
  return (
    `Esta é uma foto de uma vistoria marítima (Draft Survey). Slots disponíveis:\n${list}\n\n` +
    'Responda SOMENTE um objeto JSON ' +
    '{"slot_id":"<id do slot mais provável ou null>","flags":[<subconjunto de "dark","blurry">]}. ' +
    'Use null em slot_id se nenhum slot for claramente adequado.'
  );
}

/** Um job por foto: nenhum término do lote é descartado por janela de dedupe. */
export async function schedulePhotoClassification(
  payload: { reportId: string; photoId: string },
  send: (payload: ClassifyPhotosPayload) => Promise<string | null>,
): Promise<void> {
  if (!isAiEnabled()) return;
  const svc = getServiceClient();
  const { data: scheduled, error: loadError } = await svc
    .from('report_photos')
    .select('ai_run_id')
    .eq('id', payload.photoId)
    .eq('report_id', payload.reportId)
    .is('ai_job_id', null)
    .maybeSingle();
  if (loadError) throw loadError;
  if (!scheduled) return;
  // Se o worker caiu entre persistir pending e enviar à fila, usa a mesma geração.
  const previousRun = (scheduled as { ai_run_id: string | null }).ai_run_id;
  const runId = previousRun || randomUUID();
  let schedule = svc
    .from('report_photos')
    .update({
      ai_status: 'pending',
      ai_error: null,
      ai_run_id: runId,
      ai_request_id: null,
      ai_job_id: null,
      ai_attempt: -1,
    } as never)
    .eq('id', payload.photoId)
    .eq('report_id', payload.reportId)
    .eq('status', 'done')
    .is('slot_id', null)
    .is('confirmed_by', null)
    .is('removed_at', null)
    .is('ai_job_id', null)
    .in('ai_status', ['idle', 'error', 'pending']);
  schedule = previousRun
    ? schedule.eq('ai_run_id', previousRun)
    : schedule.is('ai_run_id', null);
  const { data: eligible, error } = await schedule.select('id');
  if (error) throw error;
  if (!eligible?.length) return;
  try {
    if (!(await send({ ...payload, runId })))
      throw new Error('A fila não aceitou a análise.');
  } catch {
    const { error: updateError } = await svc
      .from('report_photos')
      .update({
        ai_status: 'error',
        ai_error: 'Falha ao agendar a análise. Tente novamente.',
      } as never)
      .eq('id', payload.photoId)
      .eq('ai_status', 'pending')
      .eq('ai_run_id', runId);
    if (updateError) throw updateError;
  }
}

export async function classifyPhotos(
  payload: ClassifyPhotosPayload,
  deps: AiDeps = {},
  execution: ClassifyPhotosExecution = { jobId: randomUUID(), retryCount: 0 },
): Promise<void> {
  if (!isAiEnabled()) return;
  const { reportId } = payload;
  const svc = getServiceClient();
  const { data: report, error: reportError } = await svc
    .from('reports')
    .select('spec_id,status,photo_review_revision')
    .eq('id', reportId)
    .is('deleted_at', null)
    .single();
  if (reportError) throw reportError;
  const r = report as {
    spec_id: string;
    status: string;
    photo_review_revision: number;
  } | null;
  if (!r || r.status !== 'in_review') {
    let obsolete = svc
      .from('report_photos')
      .update({ ai_status: 'idle' } as never)
      .eq('report_id', reportId)
      .eq('ai_status', 'pending');
    if (payload.photoId) obsolete = obsolete.eq('id', payload.photoId);
    obsolete = payload.runId
      ? obsolete.eq('ai_run_id', payload.runId)
      : obsolete.is('ai_run_id', null);
    await obsolete;
    return;
  }
  const { data: specRow, error: specError } = await svc
    .from('report_specs')
    .select('spec')
    .eq('id', r.spec_id)
    .single();
  if (specError) throw specError;
  const slots =
    (specRow as unknown as { spec: ReportSpec } | null)?.spec?.photo_slots ??
    [];
  const validSlots = new Set(slots.map((s) => s.id));
  let query = svc
    .from('report_photos')
    .select(
      'id,processed_path,ai_status,ai_run_id,ai_request_id,ai_job_id,ai_attempt',
    )
    .eq('report_id', reportId)
    .eq('status', 'done')
    .is('slot_id', null)
    .is('confirmed_by', null)
    .is('removed_at', null)
    .in('ai_status', ['pending', 'running']);
  if (payload.photoId) query = query.eq('id', payload.photoId);
  query = payload.runId
    ? query.eq('ai_run_id', payload.runId)
    : query.is('ai_run_id', null);
  const { data: rows, error: photosError } = await query;
  if (photosError) throw photosError;
  const photos = (rows ?? []) as {
    id: string;
    processed_path: string | null;
    ai_status: string;
    ai_run_id: string | null;
    ai_request_id: string | null;
    ai_job_id: string | null;
    ai_attempt: number;
  }[];
  let suggested = 0;
  let failed = 0;
  for (const photo of photos) {
    // Só a nova entrega do MESMO job pode retomar um worker interrompido.
    // Outra cópia do job ou a execução anterior não toma a chamada em curso.
    if (
      photo.ai_status === 'running' &&
      (photo.ai_job_id !== execution.jobId ||
        execution.retryCount <= photo.ai_attempt)
    )
      continue;
    const requestId = randomUUID();
    let claim = svc
      .from('report_photos')
      .update({
        ai_status: 'running',
        ai_request_id: requestId,
        ai_job_id: execution.jobId,
        ai_attempt: execution.retryCount,
        ai_error: null,
      } as never)
      .eq('id', photo.id)
      .eq('ai_status', photo.ai_status)
      .eq('ai_attempt', photo.ai_attempt)
      .is('slot_id', null)
      .is('confirmed_by', null)
      .is('removed_at', null);
    claim = photo.ai_run_id
      ? claim.eq('ai_run_id', photo.ai_run_id)
      : claim.is('ai_run_id', null);
    claim = photo.ai_request_id
      ? claim.eq('ai_request_id', photo.ai_request_id)
      : claim.is('ai_request_id', null);
    const { data: claimed, error: claimError } = await claim.select('id');
    if (claimError) throw claimError;
    if (!claimed?.length) continue;
    try {
      if (!photo.processed_path)
        throw new Error('Foto processada indisponível.');
      const { data: blob, error: downloadError } = await svc.storage
        .from(BUCKET)
        .download(photo.processed_path);
      if (downloadError || !blob)
        throw new Error('Não foi possível carregar a foto para análise.');
      const response = await callLLM(
        {
          purpose: 'photo_classify',
          reportId,
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: Buffer.from(await blob.arrayBuffer()).toString('base64'),
              },
            },
            { type: 'text', text: buildPrompt(slots) },
          ],
          maxTokens: 256,
        },
        deps,
      );
      const parsed = parseJsonFromText(response);
      if (!parsed || typeof parsed !== 'object' || !('slot_id' in parsed)) {
        throw new Error(
          'A IA não retornou uma classificação válida. Tente novamente.',
        );
      }
      const suggestion = interpretSuggestion(parsed, validSlots);
      const { data: applied, error: applyError } = await svc.rpc(
        'apply_photo_suggestion' as never,
        {
          p_report_id: reportId,
          p_photo_id: photo.id,
          p_request_id: requestId,
          p_revision: r.photo_review_revision,
          p_slot_id: suggestion.slotId,
          p_flags: suggestion.flags,
        } as never,
      );
      if (applyError) throw applyError;
      if (applied && suggestion.slotId) suggested++;
      // Resultado obsoleto (etapa alterada ou escolha manual) nunca é aplicado.
      if (!applied)
        await svc
          .from('report_photos')
          .update({ ai_status: 'done' } as never)
          .eq('id', photo.id)
          .eq('ai_request_id', requestId)
          .eq('ai_status', 'running');
    } catch (err) {
      failed++;
      const { error } = await svc
        .from('report_photos')
        .update({
          ai_status: 'error',
          ai_error:
            err instanceof Error
              ? err.message.slice(0, 300)
              : 'Falha na classificação.',
        } as never)
        .eq('id', photo.id)
        .eq('ai_request_id', requestId)
        .eq('ai_status', 'running');
      if (error) throw error;
    }
  }
  await svc
    .from('audit_log')
    .insert({
      report_id: reportId,
      actor: null,
      action: 'ai_photo_classify',
      payload: { classified: photos.length, suggested, failed },
    } as never);
}
