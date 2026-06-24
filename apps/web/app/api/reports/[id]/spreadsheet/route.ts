import { NextResponse, type NextRequest } from 'next/server';
import ExcelJS from 'exceljs';
import { runExtraction, resolveVariant, type ReportSpec } from '@naabsa/core';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { audit } from '@/lib/audit';
import { transition } from '@/lib/state-machine';
import { enqueueRenderSheets, enqueueAiReview } from '@/lib/queue';
import { rateLimit } from '@/lib/rate-limit';

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB (RF-04)
const BUCKET = 'reports';
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Upload da planilha + extração (RF-04..RF-10). Valida o .xlsx, roda o motor do
 * @naabsa/core sobre o spec congelado, persiste extracted_data/issues (imutáveis)
 * + vessel_name, sobe o arquivo ao Storage e transiciona draft→extracted.
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

  // Rate limit de upload (RNF-05): 10/min por usuário.
  const rl = rateLimit(`spreadsheet:${user.id}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Muitas requisições. Aguarde alguns instantes e tente novamente.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Arquivo ausente.' }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    return NextResponse.json(
      { error: 'Envie um arquivo .xlsx.' },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'Arquivo acima do limite de 20 MB.' },
      { status: 413 },
    );
  }

  const { data: reportRow } = await supabase
    .from('reports')
    .select('id,status,variant,spec_id')
    .eq('id', id)
    .maybeSingle();
  const report = reportRow as {
    id: string;
    status: string;
    variant: string | null;
    spec_id: string;
  } | null;
  if (!report) {
    return NextResponse.json(
      { error: 'Relatório não encontrado.' },
      { status: 404 },
    );
  }
  if (report.status !== 'draft') {
    return NextResponse.json(
      { error: 'Este relatório já foi processado.' },
      { status: 409 },
    );
  }

  const { data: specRow } = await supabase
    .from('report_specs')
    .select('spec')
    .eq('id', report.spec_id)
    .single();
  const spec = (specRow as { spec: ReportSpec } | null)?.spec;
  if (!spec) {
    return NextResponse.json(
      { error: 'Spec do relatório não encontrado.' },
      { status: 500 },
    );
  }

  // Extração (motor do core).
  const buffer = Buffer.from(await file.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  // Variante AUTORITATIVA da planilha (spec resolve de Capa!L4). Persistida abaixo
  // para a coluna `variant` não ficar stale (UI/worker usam a mesma fonte).
  const resolvedVariant = resolveVariant(wb, spec).variant ?? report.variant;
  const { data, issues } = runExtraction(wb, spec, resolvedVariant);

  // Erro de aba/fingerprint (RF-09): não persiste, mantém draft para novo upload.
  const blocking = issues.find(
    (i) => i.field === '__fingerprint__' || i.field === '__sheet__',
  );
  if (blocking) {
    return NextResponse.json({ error: blocking.message }, { status: 422 });
  }

  // Sobe o arquivo ao Storage (service role; bucket privado).
  const svc = createServiceClient();
  await svc.storage.createBucket(BUCKET, { public: false }).catch(() => {
    /* bucket já existe */
  });
  const path = `${id}/spreadsheet.xlsx`;
  const { error: upErr } = await svc.storage
    .from(BUCKET)
    .upload(path, buffer, { upsert: true, contentType: XLSX_MIME });
  if (upErr) {
    return NextResponse.json(
      { error: `Falha no upload: ${upErr.message}` },
      { status: 500 },
    );
  }

  // Persiste resultado (extracted_data imutável após gravado — RF-10) + vessel_name.
  const vessel = typeof data.vessel_name === 'string' ? data.vessel_name : null;
  const { error: updErr } = await supabase
    .from('reports')
    .update({
      extracted_data: data,
      extraction_issues: issues,
      vessel_name: vessel,
      spreadsheet_path: path,
      variant: resolvedVariant,
    } as never)
    .eq('id', id);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  const errors = issues.filter((i) => i.level === 'error').length;
  const warnings = issues.filter((i) => i.level === 'warning').length;
  await audit(supabase, {
    reportId: id,
    actor: user.id,
    action: 'upload',
    payload: { file: file.name, size: file.size },
  });
  await audit(supabase, {
    reportId: id,
    actor: null,
    action: 'extraction',
    payload: { fields: Object.keys(data).length, errors, warnings },
  });
  await transition(supabase, id, 'draft', 'extracted', user.id);

  // Renderiza as abas da planilha como imagem (print pixel-perfeito, LibreOffice)
  // em background — disponíveis quando o operador chegar ao editor. Falha no
  // enfileiramento não bloqueia o upload (cai nas grades nativas).
  try {
    await enqueueRenderSheets({ reportId: id });
  } catch (err) {
    console.error('[spreadsheet] falha ao enfileirar render_sheets:', err);
  }

  // Revisão por IA pós-extração (010/T-007) — no-op no worker se AI_ENABLED=off.
  try {
    await enqueueAiReview({ reportId: id });
  } catch (err) {
    console.error('[spreadsheet] falha ao enfileirar ai_review:', err);
  }

  return NextResponse.json({ ok: true, reportId: id, errors, warnings });
}
