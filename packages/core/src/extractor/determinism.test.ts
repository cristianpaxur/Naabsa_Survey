import { describe, it, expect } from 'vitest';
import { runExtraction } from './pipeline';
import { sampleSpec, buildCompleteWorkbook } from './synthFixtures';

// RNF-01: para a mesma planilha + spec, a saída é profundamente idêntica.
describe('determinismo (RNF-01)', () => {
  it('runExtraction 3× sobre a mesma planilha → resultado idêntico', () => {
    const wb = buildCompleteWorkbook();
    const r1 = runExtraction(wb, sampleSpec, 'discharge');
    const r2 = runExtraction(wb, sampleSpec, 'discharge');
    const r3 = runExtraction(wb, sampleSpec, 'discharge');

    expect(r2).toEqual(r1);
    expect(r3).toEqual(r1);
    // Igualdade byte-a-byte (ordem de chaves/issues estável).
    expect(JSON.stringify(r2)).toBe(JSON.stringify(r1));
    expect(JSON.stringify(r3)).toBe(JSON.stringify(r1));
  });

  it('planilhas idênticas (instâncias distintas) → saída idêntica', () => {
    const a = runExtraction(buildCompleteWorkbook(), sampleSpec, 'discharge');
    const b = runExtraction(buildCompleteWorkbook(), sampleSpec, 'discharge');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
