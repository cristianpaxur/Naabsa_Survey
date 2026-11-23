import { createHmac, timingSafeEqual } from 'node:crypto';

/** Recibos têm domínio próprio: não são access_tokens WOPI. */
export interface SaveProof {
  kind: 'request' | 'saved';
  reportId: string;
  userId: string;
  revision: number;
  path: string;
  exp: number;
}

function signature(body: string): string {
  const secret = process.env['WOPI_TOKEN_SECRET'];
  if (!secret) throw new Error('WOPI_TOKEN_SECRET não configurado.');
  return createHmac('sha256', secret).update(`document-save:${body}`).digest('base64url');
}

export function signSaveProof(proof: Omit<SaveProof, 'exp'>): string {
  const body = Buffer.from(JSON.stringify({ ...proof, exp: Date.now() + 30 * 60_000 })).toString('base64url');
  return `${body}.${signature(body)}`;
}

export function readSaveProof(token: string | undefined, kind: SaveProof['kind'], reportId: string, userId: string): SaveProof | null {
  if (!token) return null;
  try {
    const [body, sig, extra] = token.split('.');
    if (!body || !sig || extra) return null;
    const expected = Buffer.from(signature(body));
    const actual = Buffer.from(sig);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const proof = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SaveProof;
    if (proof.kind !== kind || proof.reportId !== reportId || proof.userId !== userId ||
        !Number.isInteger(proof.revision) || proof.revision < 0 || typeof proof.path !== 'string' ||
        typeof proof.exp !== 'number' || proof.exp <= Date.now()) return null;
    return proof;
  } catch { return null; }
}
