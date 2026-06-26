import 'server-only';
import { type NextRequest, NextResponse } from 'next/server';
import { authWopi, currentLock, lockDecision, BUCKET, LOCK_TTL_MS } from '@/lib/wopi/host';

/**
 * WOPI CheckFileInfo (GET) + Lock lifecycle (POST com X-WOPI-Override) — 011/T-006.
 * Chamado pelo Collabora server-to-server. Node runtime (usa node:crypto no token).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// CheckFileInfo
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const a = await authWopi(req, id);
  if (!a.ok) return a.res;
  const { claims, svc, report } = a;

  const { data: files } = await svc.storage
    .from(BUCKET)
    .list(id, { limit: 100, search: 'working.docx' });
  const f = (files ?? []).find((x) => x.name === 'working.docx');
  const size = Number((f?.metadata as { size?: number } | undefined)?.size ?? 0);
  const lastModified = f?.updated_at ?? new Date(0).toISOString();

  return NextResponse.json({
    BaseFileName: `${(report.vessel_name ?? 'relatorio').replace(/[^\w.-]+/g, '_')}.docx`,
    Size: size,
    Version: lastModified,
    OwnerId: 'naabsa',
    UserId: claims.userId,
    UserFriendlyName: 'Operador NAABSA',
    UserCanWrite: claims.canWrite,
    UserCanNotWriteRelative: true,
    LastModifiedTime: lastModified,
    PostMessageOrigin: process.env['WOPI_PUBLIC_URL'] ?? '',
    SupportsLocks: true,
    SupportsUpdate: true,
    SupportsGetLock: true,
  });
}

// Lock / Unlock / RefreshLock / GetLock
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const a = await authWopi(req, id);
  if (!a.ok) return a.res;
  const { svc, report } = a;

  const op = req.headers.get('x-wopi-override') ?? '';
  const lock = req.headers.get('x-wopi-lock') ?? '';
  const out = lockDecision(op, currentLock(report), lock);

  if (out.newLock !== undefined) {
    await svc
      .from('reports')
      .update({
        wopi_lock: out.newLock,
        wopi_lock_expires_at: out.newLock ? new Date(Date.now() + LOCK_TTL_MS).toISOString() : null,
      } as never)
      .eq('id', id);
  }

  return new NextResponse(null, {
    status: out.status,
    headers: out.lockHeader !== undefined ? { 'X-WOPI-Lock': out.lockHeader } : undefined,
  });
}
