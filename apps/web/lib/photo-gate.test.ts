import { describe, it, expect } from 'vitest';
import type { PhotoSlot } from '@naabsa/core';
import { pendingRequiredSlots } from './photo-gate';

const slots: PhotoSlot[] = [
  { id: 'draft_fwd', label: 'Calado de proa', aspect: '4:3', required: true, max: 1 },
  { id: 'holds', label: 'Porões', aspect: '16:9', required: true, min: 2, max: 6 },
  { id: 'general', label: 'Vista geral', aspect: '16:9', required: false, max: 2 },
];

describe('pendingRequiredSlots — fotos nunca obrigatórias (política do cliente)', () => {
  it('retorna vazio mesmo com slots required não preenchidos', () => {
    expect(pendingRequiredSlots(slots, {})).toEqual([]);
    expect(pendingRequiredSlots(slots, { holds: 1 })).toEqual([]);
  });

  it('retorna vazio sem nenhuma foto', () => {
    expect(pendingRequiredSlots(slots, {})).toHaveLength(0);
  });

  it('retorna vazio quando não há slots', () => {
    expect(pendingRequiredSlots([], {})).toEqual([]);
  });
});
