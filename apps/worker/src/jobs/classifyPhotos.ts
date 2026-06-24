/**
 * Job `classify_photos` — implementação 010/T-008 (RF-37), atrás de `AI_ENABLED`.
 *
 * Pós-processamento: para cada foto PROCESSADA ainda não alocada, pede ao modelo
 * (visão) o slot mais provável + flags de qualidade (`dark`/`blurry`). Pré-aloca
 * com `ai_suggested=true` (respeitando o `max` do slot); slot inexistente é
 * descartado. Nunca envia a foto ORIGINAL (RF-38). Falha não bloqueia (RNF-06).
 */
import { getServiceClient } from '../lib/supabase';
import type { ReportSpec, PhotoSlot } from '@naabsa/core';
import { callAnthropic, isAiEnabled, parseJsonFromText, type AiDeps } from '../lib/anthropic';

export const CLASSIFY_PHOTOS_QUEUE = 'classify_photos';
export interface ClassifyPhotosPayload {
  reportId: string;
}

const BUCKET = 'reports';
const VALID_FLAGS = new Set(['dark', 'blurry', 'possible_duplicate']);

export interface PhotoSuggestion {
  slotId: string | null;
  flags: string[];
}

/** Interpreta a resposta da IA: slot VÁLIDO (ou null) + flags conhecidas (puro). */
export function interpretSuggestion(parsed: unknown, validSlots: Set<string>): PhotoSuggestion {
  const r = (parsed ?? {}) as { slot_id?: unknown; flags?: unknown };
  const slotId = typeof r.slot_id === 'string' && validSlots.has(r.slot_id) ? r.slot_id : null;
  const flags = Array.isArray(r.flags)
    ? [...new Set(r.flags.filter((f): f is string => typeof f === 'string' && VALID_FLAGS.has(f)))]
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

export async function classifyPhotos(payload: ClassifyPhotosPayload, deps: AiDeps = {}): Promise<void> {
  if (!isAiEnabled()) return; // flag off → no-op (RNF-06)
  const { reportId } = payload;
  const svc = getServiceClient();

  const { data: report } = await svc.from('reports').select('spec_id, status').eq('id', reportId).single();
  const r = report as { spec_id: string; status: string } | null;
  if (!r || r.status !== 'in_review') return; // fotos pertencem à revisão

  const { data: specRow } = await svc.from('report_specs').select('spec').eq('id', r.spec_id).single();
  const slots = (specRow as { spec: ReportSpec } | null)?.spec?.photo_slots ?? [];
  if (slots.length === 0) return;
  const validSlots = new Set(slots.map((s) => s.id));
  const slotMax = new Map(slots.map((s) => [s.id, s.max ?? Number.POSITIVE_INFINITY]));

  // Fotos processadas ainda não alocadas nem sugeridas.
  const { data: photosRaw } = await svc
    .from('report_photos')
    .select('id, processed_path')
    .eq('report_id', reportId)
    .eq('status', 'done')
    .is('slot_id', null)
    .eq('ai_suggested', false);
  const photos = (photosRaw ?? []) as { id: string; processed_path: string | null }[];
  if (photos.length === 0) return;

  // Contagem atual por slot (respeita o max ao pré-alocar).
  const { data: allocRaw } = await svc
    .from('report_photos')
    .select('slot_id')
    .eq('report_id', reportId)
    .not('slot_id', 'is', null);
  const count = new Map<string, number>();
  for (const a of (allocRaw ?? []) as { slot_id: string }[]) count.set(a.slot_id, (count.get(a.slot_id) ?? 0) + 1);

  const prompt = buildPrompt(slots);
  let suggested = 0;
  for (const ph of photos) {
    if (!ph.processed_path) continue;
    const { data: blob } = await svc.storage.from(BUCKET).download(ph.processed_path);
    if (!blob) continue;
    const b64 = Buffer.from(await blob.arrayBuffer()).toString('base64');
    const text = await callAnthropic(
      {
        purpose: 'photo_classify',
        reportId,
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
          { type: 'text', text: prompt },
        ],
        maxTokens: 256,
      },
      deps,
    );
    const sug = interpretSuggestion(parseJsonFromText(text), validSlots);

    // Só pré-aloca se o slot tem espaço.
    let slotId = sug.slotId;
    if (slotId && (count.get(slotId) ?? 0) >= (slotMax.get(slotId) ?? Number.POSITIVE_INFINITY)) {
      slotId = null;
    }
    const update: Record<string, unknown> = { quality_flags: sug.flags };
    if (slotId) {
      update['slot_id'] = slotId;
      update['ai_suggested'] = true;
      count.set(slotId, (count.get(slotId) ?? 0) + 1);
      suggested += 1;
    }
    await svc.from('report_photos').update(update as never).eq('id', ph.id);
  }

  await svc.from('audit_log').insert({
    report_id: reportId,
    actor: null,
    action: 'ai_photo_classify',
    payload: { classified: photos.length, suggested },
  } as never);
  console.log(`[classify_photos] ${reportId}: ${suggested}/${photos.length} pré-alocadas pela IA.`);
}
