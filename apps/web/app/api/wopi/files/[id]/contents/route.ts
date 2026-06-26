import 'server-only';
import { type NextRequest, NextResponse } from 'next/server';
import { authWopi, currentLock, workingDocxPath, BUCKET } from '@/lib/wopi/host';

/**
 * WOPI GetFile (GET) + PutFile (POST) — 011/T-007. Lê/grava o `working.docx` no
 * Storage. Chamado pelo Collabora server-to-server. Node runtime.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GetFile
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const a = await authWopi(req, id);
  if (!a.ok) return a.res;

  const { data, error } = await a.svc.storage.from(BUCKET).download(workingDocxPath(id));
  if (error || !data) return new NextResponse(null, { status: 404 });
  const buf = Buffer.from(await data.arrayBuffer());
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'content-type': 'application/octet-stream',
      'content-length': String(buf.length),
    },
  });
}

// PutFile
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const a = await authWopi(req, id);
  if (!a.ok) return a.res;
  const { claims, svc, report } = a;

  if (!claims.canWrite) return new NextResponse(null, { status: 403 });

  // O Collabora envia X-WOPI-Lock no PutFile; rejeita se o lock divergir.
  const lock = req.headers.get('x-wopi-lock') ?? '';
  const cur = currentLock(report);
  if (cur && lock && cur !== lock) {
    return new NextResponse(null, { status: 409, headers: { 'X-WOPI-Lock': cur } });
  }

  const body = Buffer.from(await req.arrayBuffer());
  if (body.length === 0) return new NextResponse(null, { status: 400 });

  const { error } = await svc.storage.from(BUCKET).upload(workingDocxPath(id), body, {
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    upsert: true,
  });
  if (error) return new NextResponse(null, { status: 500 });

  if (!report.working_docx_path) {
    await svc
      .from('reports')
      .update({ working_docx_path: workingDocxPath(id) } as never)
      .eq('id', id);
  }
  return new NextResponse(null, { status: 200 });
}
