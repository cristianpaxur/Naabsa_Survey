import 'server-only';
import { type NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { verifyToken, type WopiClaims } from './token';
import type { WopiReport } from './lock';
import { isCurrentAccessToken } from '@/lib/users/access';

export { canPutFile, currentLock, lockDecision } from './lock';
export type { WopiReport, LockOutcome } from './lock';

/**
 * Helpers compartilhados do WOPI host (011/T-006, T-007). As rotas WOPI são
 * chamadas pelo Collabora server-to-server (sem a sessão Supabase do browser),
 * então autenticamos pelo access_token assinado (lib/wopi/token).
 */
export const BUCKET = 'reports';
export const LOCK_TTL_MS = 30 * 60 * 1000; // 30 min; renovado por RefreshLock
export const workingDocxPath = (id: string): string => `${id}/working.docx`;

export type WopiAuth =
  | { ok: false; res: NextResponse }
  | {
      ok: true;
      claims: WopiClaims;
      svc: ReturnType<typeof createServiceClient>;
      report: WopiReport;
    };

/** Valida o access_token (query) e carrega o relatório. */
export async function authWopi(
  req: NextRequest,
  id: string,
): Promise<WopiAuth> {
  const token = req.nextUrl.searchParams.get('access_token');
  if (!token) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: 'missing access_token' },
        { status: 401 },
      ),
    };
  }
  const claims = verifyToken(token);
  if (!claims || claims.reportId !== id) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: 'invalid access_token' },
        { status: 401 },
      ),
    };
  }
  const svc = createServiceClient();
  const { data: profile, error: profileError } = await svc
    .from('profiles')
    .select('role,status,access_revoked_at')
    .eq('user_id', claims.userId)
    .maybeSingle();
  if (profileError || !profile || !isCurrentAccessToken(profile, claims.iat)) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: 'Acesso revogado ou indisponível.' },
        { status: 403 },
      ),
    };
  }
  const { data } = await svc
    .from('reports')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!data) {
    return {
      ok: false,
      res: NextResponse.json({ error: 'report not found' }, { status: 404 }),
    };
  }
  return { ok: true, claims, svc, report: data as unknown as WopiReport };
}
