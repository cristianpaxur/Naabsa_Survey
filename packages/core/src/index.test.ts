import { describe, it, expect } from 'vitest';
import * as core from './index';

// Teste-sentinela (T-007): prova que o pipeline Vitest roda no @naabsa/core.
// Testes reais do motor entram na implementação 003.
describe('@naabsa/core — sentinela', () => {
  it('o pacote é importável', () => {
    expect(core).toBeTypeOf('object');
  });

  it('o runner executa asserções', () => {
    expect(1 + 1).toBe(2);
  });
});
