import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { audit } from '@/lib/audit';
import { enqueueProcessPhoto } from '@/lib/queue';
import { rateLimit } from '@/lib/rate-limit';

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB por foto (RF-15)
const BUCKET = 'reports';

/** Tipos aceitos (jpg/png/heic) → extensão canônica do original. */
const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heic',
};

/** Resolve a extensão a partir do MIME ou do nome do arquivo. */
function resolveExt(file: File): string | null {
  const byMime = ALLOWED[file.type.toLowerCase()];
  if (byMime) return byMime;
  const name = file.name.toLowerCase();
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'jpg';
  if (name.endsWith('.png')) return 'png';
  if (name.endsWith('.heic') || name.endsWith('.heif')) return 'heic';
  return null;
}

interface RejectedFile {
  name: string;
  status: number;
  reason: string;
}

/**
 * Upload em lote de fotos (RF-15). Multipart multi-arquivo: valida formato
 * (jpg/png/heic → 415) e tamanho (≤ 15 MB → 413) por arquivo, salva os
 * originais no Storage, cria as linhas em `report_photos` (status pending) e
 * enfileira `process_photo` para cada uma. Arquivos inválidos são reportados
 * sem bloquear os válidos. Audita o upload. Retorna 202 com os ids criados.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });
  }

  // Rate limit de upload de fotos (RNF-05): 20 lotes/min por usuário.
  const rl = rateLimit(`photos:${user.id}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Muitas requisições. Aguarde alguns instantes e tente novamente.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  const { data: reportRow } = await supabase
    .from('reports')
    .select('id,status')
    .eq('id', id)
    .maybeSingle();
  const report = reportRow as { id: string; status: string } | null;
  if (!report) {
    return NextResponse.json(
      { error: 'Relatório não encontrado.' },
      { status: 404 },
    );
  }
  // Fotos são alocadas durante a revisão (in_review) antes da edição.
  if (report.status !== 'in_review' && report.status !== 'extracted') {
    return NextResponse.json(
      { error: 'Fotos só podem ser enviadas durante a revisão.' },
      { status: 409 },
    );
  }

  const form = await req.formData();
  const entries = form.getAll('files');
  const files = entries.filter((e): e is File => e instanceof File);
  if (files.length === 0) {
    return NextResponse.json(
      { error: 'Nenhum arquivo enviado.' },
      { status: 400 },
    );
  }

  const svc = createServiceClient();
  await svc.storage.createBucket(BUCKET, { public: false }).catch(() => {
    /* bucket já existe */
  });

  const photoIds: string[] = [];
  const rejected: RejectedFile[] = [];

  for (const file of files) {
    const ext = resolveExt(file);
    if (!ext) {
      rejected.push({
        name: file.name,
        status: 415,
        reason: 'Formato inválido (use jpg, png ou heic).',
      });
      continue;
    }
    if (file.size > MAX_BYTES) {
      rejected.push({
        name: file.name,
        status: 413,
        reason: 'Acima do limite de 15 MB.',
      });
      continue;
    }

    const uuid = randomUUID();
    const originalPath = `${id}/photos/original/${uuid}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await svc.storage
      .from(BUCKET)
      .upload(originalPath, buffer, {
        upsert: false,
        contentType: file.type || `image/${ext}`,
      });
    if (upErr) {
      rejected.push({
        name: file.name,
        status: 500,
        reason: `Falha no upload: ${upErr.message}`,
      });
      continue;
    }

    const { data: inserted, error: insErr } = await supabase
      .from('report_photos')
      .insert({
        report_id: id,
        original_path: originalPath,
        status: 'pending',
        slot_id: null,
      } as never)
      .select('id')
      .single();
    if (insErr || !inserted) {
      rejected.push({
        name: file.name,
        status: 500,
        reason: 'Falha ao registrar a foto.',
      });
      continue;
    }
    const photoId = (inserted as { id: string }).id;
    photoIds.push(photoId);

    try {
      await enqueueProcessPhoto({ photoId, reportId: id });
    } catch (err) {
      // Falha ao enfileirar não perde a foto: marca erro recuperável.
      await supabase
        .from('report_photos')
        .update({
          status: 'error',
          error_message:
            err instanceof Error ? err.message : 'Falha ao enfileirar.',
        } as never)
        .eq('id', photoId);
    }
  }

  await audit(supabase, {
    reportId: id,
    actor: user.id,
    action: 'upload_photos',
    payload: { accepted: photoIds.length, rejected: rejected.length },
  });

  return NextResponse.json({ photoIds, rejected }, { status: 202 });
}
