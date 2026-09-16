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

  if (!report.working_docx_path) return new NextResponse(null, { status: 404 });
  const slash = report.working_docx_path.lastIndexOf('/');
  const directory = report.working_docx_path.slice(0, slash);
  const filename = report.working_docx_path.slice(slash + 1);
  const { data: files, error } = await svc.storage
    .from(BUCKET)
    .list(directory, { limit: 100, search: filename });
  const f = (files ?? []).find((x) => x.name === filename);
  if (error || !f) return new NextResponse(null, { status: 404 });
  const size = Number((f?.metadata as { size?: number } | undefined)?.size ?? 0);
  // Precisa ser exatamente o mesmo valor devolvido pelo PutFile. O timestamp
  // do objeto no Storage é atribuído depois do upload e pode diferir alguns
  // segundos de `working_docx_saved_at`; misturar os dois faz o Collabora
  // concluir incorretamente que outro processo alterou o documento.
  const lastModified = report.working_docx_saved_at ?? f?.updated_at ?? new Date(0).toISOString();

  return NextResponse.json({
    BaseFileName: `${(report.vessel_name ?? 'relatorio').replace(/[^\w.-]+/g, '_')}.docx`,
    Size: size,
    Version: String(report.working_docx_revision ?? 0),
    OwnerId: 'naabsa',
    UserId: claims.userId,
    UserFriendlyName: 'Operador NAABSA',
    UserCanWrite: claims.canWrite && report.status === 'editing',
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
