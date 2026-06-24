import { describe, it, expect, beforeEach } from 'vitest';
import { rateLimit, __resetRateLimits } from './rate-limit';

describe('rateLimit (010/T-010)', () => {
  beforeEach(() => __resetRateLimits());

  it('permite até o limite e bloqueia além (com Retry-After)', () => {
    for (let i = 0; i < 3; i++) expect(rateLimit('k', 3, 1000, 0).ok).toBe(true);
    const r = rateLimit('k', 3, 1000, 500);
    expect(r.ok).toBe(false);
    expect(r.retryAfterSec).toBe(1);
  });

  it('reabre a janela após windowMs', () => {
    for (let i = 0; i < 3; i++) rateLimit('k', 3, 1000, 0);
    expect(rateLimit('k', 3, 1000, 1000).ok).toBe(true);
  });

  it('chaves independentes', () => {
    rateLimit('a', 1, 1000, 0);
    expect(rateLimit('a', 1, 1000, 0).ok).toBe(false);
    expect(rateLimit('b', 1, 1000, 0).ok).toBe(true);
  });
});
