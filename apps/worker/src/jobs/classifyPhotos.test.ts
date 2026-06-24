import { describe, it, expect } from 'vitest';
import { interpretSuggestion } from './classifyPhotos';

const slots = new Set(['cover', 'photos_initial', 'photos_final']);

describe('interpretSuggestion (010/T-008)', () => {
  it('slot válido + flags válidas', () => {
    expect(interpretSuggestion({ slot_id: 'photos_initial', flags: ['dark'] }, slots)).toEqual({
      slotId: 'photos_initial',
      flags: ['dark'],
    });
  });

  it('slot inexistente → slotId null (descarta alucinação)', () => {
    expect(interpretSuggestion({ slot_id: 'inexistente', flags: [] }, slots)).toEqual({
      slotId: null,
      flags: [],
    });
  });

  it('flags desconhecidas são filtradas; conhecidas mantidas e deduplicadas', () => {
    expect(
      interpretSuggestion({ slot_id: 'cover', flags: ['blurry', 'xpto', 'blurry', 'dark'] }, slots).flags.sort(),
    ).toEqual(['blurry', 'dark']);
  });

  it('null / objeto vazio / tipos errados → {null, []}', () => {
    expect(interpretSuggestion(null, slots)).toEqual({ slotId: null, flags: [] });
    expect(interpretSuggestion({}, slots)).toEqual({ slotId: null, flags: [] });
    expect(interpretSuggestion({ slot_id: 123, flags: 'nope' }, slots)).toEqual({ slotId: null, flags: [] });
  });
});
