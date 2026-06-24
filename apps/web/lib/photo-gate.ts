import type { PhotoSlot } from '@naabsa/core';

/**
 * Gate de avanço (RF-19 relaxado por política do cliente): as FOTOS NUNCA são
 * obrigatórias — muitas vezes são ruins ou não cabem no documento — então nenhum
 * slot bloqueia o avanço. Mantemos a assinatura (UI + Server Action usam) e
 * retornamos sempre vazio. Os slots seguem existindo e aceitando fotos.
 */
export function pendingRequiredSlots(
  slots: PhotoSlot[],
  counts: Record<string, number>,
): PhotoSlot[] {
  // Fotos nunca são obrigatórias → exigimos 0; nenhum slot fica pendente.
  const REQUIRED = 0;
  return slots.filter((slot) => (counts[slot.id] ?? 0) < REQUIRED);
}
