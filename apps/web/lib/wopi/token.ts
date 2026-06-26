/**
 * Access token WOPI (011/T-004). O Collabora chama os endpoints WOPI do app
 * server-to-server (não tem a sessão Supabase do browser), então autenticamos
 * por um token assinado pelo próprio app, ligado a {relatório, usuário, escrita}.
 *
 * Formato: `base64url(JSON claims).HMAC-SHA256(base64url, segredo)`.
 * Segredo em `WOPI_TOKEN_SECRET` (env, nunca no código — PRD §13).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface WopiClaims {
  reportId: string;
  userId: string;
  /** Permissão de escrita (PutFile). `false` em approved/generated (leitura). */
  canWrite: boolean;
  /** Expiração (epoch em segundos). */
  exp: number;
}

function getSecret(secret?: string): string {
  const s = secret ?? process.env['WOPI_TOKEN_SECRET'];
  if (!s) throw new Error('WOPI_TOKEN_SECRET não configurado.');
  return s;
}

function hmac(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

/** Emite um access_token assinado com TTL (default 60 min). */
export function signToken(
  claims: Omit<WopiClaims, 'exp'>,
  ttlSeconds = 3600,
  secret?: string,
): string {
  const s = getSecret(secret);
  const full: WopiClaims = { ...claims, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  return `${body}.${hmac(body, s)}`;
}

/** Valida assinatura (tempo constante) e expiração; devolve os claims ou `null`. */
export function verifyToken(token: string, secret?: string): WopiClaims | null {
  const s = getSecret(secret);
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = hmac(body, s);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')) as WopiClaims;
    if (typeof claims.exp !== 'number' || claims.exp < Math.floor(Date.now() / 1000)) return null;
    if (!claims.reportId || !claims.userId) return null;
    return claims;
  } catch {
    return null;
  }
}
