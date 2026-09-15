import 'server-only';
import { randomUUID } from 'node:crypto';
import { type NextRequest, NextResponse } from 'next/server';
import { authWopi, canPutFile, currentLock, BUCKET } from '@/lib/wopi/host';

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

  if (!a.report.working_docx_path) return new NextResponse(null, { status: 404 });
  const { data, error } = await a.svc.storage.from(BUCKET).download(a.report.working_docx_path);
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

  // Fora de `editing` o working.docx está congelado (é o registro do documento
  // aprovado — 012/T-007). Rejeita PutFile tardio de sessão aberta antes da
  // aprovação (o token dela ainda tem canWrite), senão o PDF divergiria do doc.
  if (!canPutFile(report)) {
    return new NextResponse(null, {
      status: 409,
      headers: { 'X-WOPI-Lock': currentLock(report) ?? '' },
    });
  }

  // O Collabora envia X-WOPI-Lock no PutFile; rejeita se o lock divergir.
  const lock = req.headers.get('x-wopi-lock') ?? '';
  const cur = currentLock(report);
  if (cur && cur !== lock) {
    return new NextResponse(null, { status: 409, headers: { 'X-WOPI-Lock': cur } });
  }

  const body = Buffer.from(await req.arrayBuffer());
  if (body.length === 0) return new NextResponse(null, { status: 400 });

  if (!report.working_docx_path || report.working_docx_revision === undefined) {
    return new NextResponse(null, { status: 409 });
  }
  // Nunca modifica bytes publicados. Um PutFile concorrente à aprovação só
  // cria um objeto novo; o CAS abaixo decide se ele pode se tornar o atual.
  const path = `${id}/working/${randomUUID()}.docx`;
  const revision = report.working_docx_revision + 1;
  const savedAt = new Date().toISOString();
  const { error } = await svc.storage.from(BUCKET).upload(path, body, {
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    upsert: false,
  });
  if (error) return new NextResponse(null, { status: 500 });

  const saved = await svc.from('reports').update({
    working_docx_path: path,
    working_docx_revision: revision,
    working_docx_saved_at: savedAt,
  } as never, { count: 'exact' }).eq('id', id).eq('status', 'editing')
    .eq('working_docx_path', report.working_docx_path)
    .eq('working_docx_revision', report.working_docx_revision);
  // Em falha de rede a confirmação do banco é ambígua; não apagar o objeto
  // pois o commit pode ter ocorrido. Versões são conservadas junto aos snapshots.
  if (saved.error) return new NextResponse(null, { status: 500 });
  if (saved.count !== 1) return new NextResponse(null, { status: 409, headers: { 'X-WOPI-Lock': cur ?? '' } });
  // O contrato WOPI exige JSON com LastModifiedTime mesmo em HTTP 200. Sem
  // esse corpo o Collabora considera o PutFile ambíguo, mantém "Salvando…" e
  // não confirma a revisão ao host, apesar de os bytes já terem sido gravados.
  return NextResponse.json(
    { LastModifiedTime: savedAt },
    { status: 200, headers: { 'X-WOPI-ItemVersion': String(revision) } },
  );
}
