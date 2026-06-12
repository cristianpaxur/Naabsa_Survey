import { describe, it, expect } from 'vitest';
import type { PhotoSlot } from '@naabsa/core';
import { pendingRequiredSlots } from './photo-gate';

const slots: PhotoSlot[] = [
  { id: 'draft_fwd', label: 'Calado de proa', aspect: '4:3', required: true, max: 1 },
  { id: 'holds', label: 'Porões', aspect: '16:9', required: true, min: 2, max: 6 },
  { id: 'general', label: 'Vista geral', aspect: '16:9', required: false, max: 2 },
];

describe('pendingRequiredSlots (gate de avanço RF-19)', () => {
  it('slot obrigatório vazio fica pendente', () => {
    const pending = pendingRequiredSlots(slots, { holds: 2 });
    expect(pending.map((s) => s.id)).toEqual(['draft_fwd']);
  });

  it('slot múltiplo abaixo do min fica pendente', () => {
    const pending = pendingRequiredSlots(slots, { draft_fwd: 1, holds: 1 });
    expect(pending.map((s) => s.id)).toEqual(['holds']);
  });

  it('todos os obrigatórios satisfeitos → nenhum pendente', () => {
    const pending = pendingRequiredSlots(slots, { draft_fwd: 1, holds: 2 });
    expect(pending).toHaveLength(0);
  });

  it('slot opcional nunca bloqueia, mesmo vazio', () => {
    const pending = pendingRequiredSlots(slots, { draft_fwd: 1, holds: 3 });
    expect(pending.find((s) => s.id === 'general')).toBeUndefined();
  });

  it('min default 1 quando required sem min explícito', () => {
    const one: PhotoSlot[] = [
      { id: 'x', label: 'X', aspect: '4:3', required: true },
    ];
    expect(pendingRequiredSlots(one, {})).toHaveLength(1);
    expect(pendingRequiredSlots(one, { x: 1 })).toHaveLength(0);
  });
});
