'use server';

import type { PhotoSlot, ReportSpec } from '@naabsa/core';
import { createClient } from '@/lib/supabase/server';
import type { ServerClient } from '@/lib/supabase/server';
import { audit } from '@/lib/audit';
import { transition } from '@/lib/state-machine';

export interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ActionResult = { ok: true } | { error: string };

interface ReportRow {
  id: string;
  status: string;
  spec_id: string;
}

interface PhotoRow {
  id: string;
  report_id: string;
  slot_id: string | null;
  position: number;
  crop: Crop | null;
}

async function loadReport(
  supabase: ServerClient,
  reportId: string,
): Promise<ReportRow | null> {
  const { data } = await supabase
    .from('reports')
    .select('id,status,spec_id')
    .eq('id', reportId)
    .maybeSingle();
  return (data as ReportRow | null) ?? null;
}

async function loadSpec(
  supabase: ServerClient,
  specId: string,
): Promise<ReportSpec | null> {
  const { data } = await supabase
    .from('report_specs')
    .select('spec')
    .eq('id', specId)
    .maybeSingle();
  return (data as { spec: ReportSpec } | null)?.spec ?? null;
}

function findSlot(spec: ReportSpec, slotId: string): PhotoSlot | undefined {
  return (spec.photo_slots ?? []).find((s) => s.id === slotId);
}

/**
 * Aloca uma foto em um slot na posição informada (RF-17). Valida o limite `max`
 * do slot e, se a foto mudou de slot, reseta o crop (crop é por alocação — RF-18).
 * Audita a ação.
 */
export async function allocate(
  reportId: string,
  photoId: string,
  slotId: string,
  position: number,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sessão expirada.' };

  const report = await loadReport(supabase, reportId);
  if (!report) return { error: 'Relatório não encontrado.' };
  if (report.status !== 'in_review') {
    return { error: 'A alocação só é permitida durante a revisão.' };
  }

  const spec = await loadSpec(supabase, report.spec_id);
  if (!spec) return { error: 'Spec não encontrado.' };
  const slot = findSlot(spec, slotId);
  if (!slot) return { error: 'Slot inválido.' };

  const { data: photoRow } = await supabase
    .from('report_photos')
    .select('id,report_id,slot_id,position,crop')
    .eq('id', photoId)
    .maybeSingle();
  const photo = photoRow as PhotoRow | null;
  if (!photo || photo.report_id !== reportId) {
    return { error: 'Foto não encontrada.' };
  }

  // Valida `max`: conta as já alocadas nesse slot (excluindo a própria foto).
  if (typeof slot.max === 'number') {
    const { count } = await supabase
      .from('report_photos')
      .select('id', { count: 'exact', head: true })
      .eq('report_id', reportId)
      .eq('slot_id', slotId)
      .neq('id', photoId);
    if ((count ?? 0) >= slot.max) {
      return { error: `Slot cheio (máx. ${slot.max}).` };
    }
  }

  const movedSlot = photo.slot_id !== slotId;
  const { error } = await supabase
    .from('report_photos')
    .update({
      slot_id: slotId,
      position,
      // Crop é por alocação: ao mover de slot, reseta (RF-18 / decisão do spec).
      crop: movedSlot ? null : photo.crop,
    } as never)
    .eq('id', photoId);
  if (error) return { error: 'Falha ao alocar a foto.' };

  await audit(supabase, {
    reportId,
    actor: user.id,
    action: 'allocate_photo',
    payload: { photoId, slotId, position, cropReset: movedSlot },
  });
  return { ok: true };
}

/**
 * Reordena as fotos dentro de um slot (RF-17). Recebe a lista ordenada de ids;
 * grava `position` por índice. Audita a ação.
 */
export async function reorder(
  reportId: string,
  slotId: string,
  photoIds: string[],
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sessão expirada.' };

  const report = await loadReport(supabase, reportId);
  if (!report) return { error: 'Relatório não encontrado.' };
  if (report.status !== 'in_review') {
    return { error: 'A reordenação só é permitida durante a revisão.' };
  }

  for (let i = 0; i < photoIds.length; i++) {
    const pid = photoIds[i];
    if (!pid) continue;
    const { error } = await supabase
      .from('report_photos')
      .update({ position: i } as never)
      .eq('id', pid)
      .eq('report_id', reportId)
      .eq('slot_id', slotId);
    if (error) return { error: 'Falha ao reordenar.' };
  }

  await audit(supabase, {
    reportId,
    actor: user.id,
    action: 'reorder_photos',
    payload: { slotId, order: photoIds },
  });
  return { ok: true };
}

/**
 * Salva as coordenadas de crop de uma foto alocada (RF-18). As coordenadas são
 * relativas à processada (0–1). Audita a ação.
 */
export async function saveCrop(
  reportId: string,
  photoId: string,
  crop: Crop,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sessão expirada.' };

  const report = await loadReport(supabase, reportId);
  if (!report) return { error: 'Relatório não encontrado.' };
  if (report.status !== 'in_review') {
    return { error: 'O recorte só é permitido durante a revisão.' };
  }

  const valid = [crop.x, crop.y, crop.width, crop.height].every(
    (n) => typeof n === 'number' && n >= 0 && n <= 1,
  );
  if (!valid) return { error: 'Coordenadas de recorte inválidas.' };

  const { data: photoRow } = await supabase
    .from('report_photos')
    .select('id,report_id,slot_id')
    .eq('id', photoId)
    .maybeSingle();
  const photo = photoRow as {
    id: string;
    report_id: string;
    slot_id: string | null;
  } | null;
  if (!photo || photo.report_id !== reportId) {
    return { error: 'Foto não encontrada.' };
  }
  if (!photo.slot_id) {
    return { error: 'Aloque a foto em um slot antes de recortar.' };
  }

  const { error } = await supabase
    .from('report_photos')
    .update({ crop } as never)
    .eq('id', photoId);
  if (error) return { error: 'Falha ao salvar o recorte.' };

  await audit(supabase, {
    reportId,
    actor: user.id,
    action: 'crop_photo',
    payload: { photoId, slotId: photo.slot_id, crop },
  });
  return { ok: true };
}

/**
 * Conta, por slot, quantas fotos estão alocadas. Slot obrigatório precisa de
 * `min` (default 1) fotos. Retorna a lista de slots pendentes.
 */
export function pendingRequiredSlots(
  slots: PhotoSlot[],
  counts: Record<string, number>,
): PhotoSlot[] {
  return slots.filter((s) => {
    if (!s.required) return false;
    const need = s.min ?? 1;
    return (counts[s.id] ?? 0) < need;
  });
}

/**
 * Avança da revisão para a edição (RF-19). Valida no servidor que todos os
 * slots `required`/`min` estão satisfeitos (defesa dupla com a UI), transiciona
 * in_review→editing e audita.
 */
export async function advance(reportId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sessão expirada.' };

  const report = await loadReport(supabase, reportId);
  if (!report) return { error: 'Relatório não encontrado.' };
  if (report.status !== 'in_review') {
    return { error: 'O relatório não está em revisão.' };
  }

  const spec = await loadSpec(supabase, report.spec_id);
  if (!spec) return { error: 'Spec não encontrado.' };
  const slots = spec.photo_slots ?? [];

  // Conta alocações por slot.
  const { data: rows } = await supabase
    .from('report_photos')
    .select('slot_id')
    .eq('report_id', reportId)
    .not('slot_id', 'is', null);
  const counts: Record<string, number> = {};
  for (const r of (rows as { slot_id: string }[] | null) ?? []) {
    counts[r.slot_id] = (counts[r.slot_id] ?? 0) + 1;
  }

  const pending = pendingRequiredSlots(slots, counts);
  if (pending.length > 0) {
    return {
      error: `${pending.length} slot(s) obrigatório(s) pendente(s).`,
    };
  }

  try {
    await transition(supabase, reportId, 'in_review', 'editing', user.id);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Falha ao avançar.',
    };
  }
  return { ok: true };
}
