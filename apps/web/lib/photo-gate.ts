import type { PhotoSlot } from '@naabsa/core';

/**
 * Gate de avanço (RF-19): retorna os slots `required` ainda não satisfeitos.
 * Slot obrigatório precisa de `min` (default 1) fotos alocadas. Função pura,
 * compartilhada entre a UI (habilitar o botão) e a Server Action (defesa dupla).
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
