import { describe, it, expect } from 'vitest';
import { isEligibleForPurge, RETENTION_DAYS } from './retentionPurge';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-06-24T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW - n * DAY).toISOString();

describe('isEligibleForPurge (010/T-001, janela do último PDF)', () => {
  it('sem PDF (null) → não elegível', () => {
    expect(isEligibleForPurge(null, NOW)).toBe(false);
  });

  it('data inválida → não elegível', () => {
    expect(isEligibleForPurge('não-é-data', NOW)).toBe(false);
  });

  it('PDF recente (10 dias) → não elegível', () => {
    expect(isEligibleForPurge(daysAgo(10), NOW)).toBe(false);
  });

  it(`exatamente na janela (${RETENTION_DAYS} dias) → não elegível (estrito)`, () => {
    expect(isEligibleForPurge(daysAgo(RETENTION_DAYS), NOW)).toBe(false);
  });

  it(`além da janela (${RETENTION_DAYS + 1} dias) → elegível`, () => {
    expect(isEligibleForPurge(daysAgo(RETENTION_DAYS + 1), NOW)).toBe(true);
  });

  it('muito antigo (90 dias) → elegível', () => {
    expect(isEligibleForPurge(daysAgo(90), NOW)).toBe(true);
  });
});
