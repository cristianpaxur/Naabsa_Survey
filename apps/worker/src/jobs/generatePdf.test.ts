import { describe, it, expect } from 'vitest';
import { nextPdfVersion } from './generatePdf';

describe('nextPdfVersion (010/T-005, CA-003)', () => {
  it('primeira geração → v1', () => {
    expect(nextPdfVersion([])).toBe(1);
  });

  it('acumula a partir da maior versão existente', () => {
    expect(nextPdfVersion(['3ffa/final-v1.pdf'])).toBe(2);
    expect(nextPdfVersion(['3ffa/final-v1.pdf', '3ffa/final-v2.pdf'])).toBe(3);
  });

  it('ignora caminhos legados sem versão (final.pdf antigo)', () => {
    expect(nextPdfVersion(['3ffa/final.pdf'])).toBe(1);
    expect(nextPdfVersion(['3ffa/final.pdf', '3ffa/final-v3.pdf'])).toBe(4);
  });
});
