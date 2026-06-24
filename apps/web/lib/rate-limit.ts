/**
 * Rate limit simples (010/T-010, RNF-05): janela fixa em memória, por instância.
 * Suficiente para o deploy single-VPS (1 processo web). Chave por usuário/rota.
 */
interface Bucket {
  count: number;
  resetAt: number;
}
const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  /** Segundos até a janela reabrir (para o header Retry-After). */
  retryAfterSec: number;
}

/** Permite `limit` requisições por `windowMs` por `key`. `now` injetável p/ teste. */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult {
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  if (b.count >= limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
  b.count += 1;
  return { ok: true, retryAfterSec: 0 };
}

/** Esvazia os buckets (uso em teste). */
export function __resetRateLimits(): void {
  buckets.clear();
}
