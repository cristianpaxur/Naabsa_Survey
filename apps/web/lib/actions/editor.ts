'use server';

import type { TipTapDoc } from '@naabsa/core';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import type { ServerClient } from '@/lib/supabase/server';
import { audit } from '@/lib/audit';
import { transition, type ReportStatus } from '@/lib/state-machine';
import { enqueueGeneratePdf, enqueuePreviewPdf } from '@/lib/queue';
import { signToken } from '@/lib/wopi/token';
import { getEditorUrlSrc } from '@/lib/wopi/discovery';

export type SaveResult =
  | { ok: true; savedAt: string }
  | { error: string };

export type ApproveResult = { ok: true } | { error: string };

export interface PdfStatus {
  status: ReportStatus;
  hasPdf: boolean;
}

interface ReportRow {
  id: string;
  status: string;
  pdf_paths: string[] | null;
}

async function loadReport(
  supabase: ServerClient,
  reportId: string,
): Promise<ReportRow | null> {
  const { data } = await supabase
    .from('reports')
    .select('id,status,pdf_paths')
    .eq('id', reportId)
    .maybeSingle();
  return (data as ReportRow | null) ?? null;
}

/**
 * Autosave do documento (008/T-005, RF-24). Persiste `document_json` somente
 * quando o relatório está em `editing`. Quando `snapshot` é true, grava também
 * uma cópia integral no audit_log (RNF-07) — usado a cada ≤ 5 min de edição.
 */
export async function saveDocument(
  reportId: string,
  json: TipTapDoc,
  snapshot = false,
): Promise<SaveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sessão expirada.' };

  const report = await loadReport(supabase, reportId);
  if (!report) return { error: 'Relatório não encontrado.' };
  if (report.status !== 'editing') {
    return { error: 'O documento só pode ser editado no estado de edição.' };
  }

  const { error } = await supabase
    .from('reports')
    .update({ document_json: json } as never)
    .eq('id', reportId)
    .eq('status', 'editing'); // guarda otimista
  if (error) return { error: 'Falha ao salvar o documento.' };

  if (snapshot) {
    await audit(supabase, {
      reportId,
      actor: user.id,
      action: 'document_snapshot',
      payload: { document_json: json },
    });
  }

  return { ok: true, savedAt: new Date().toISOString() };
}

/**
 * Aprovação (008/T-008, RF-26). Persiste a última versão, grava snapshot final,
 * transiciona `editing → approved`, enfileira `generate_pdf` e audita. Revalida
 * o status contra concorrência (a transição usa guarda otimista).
 */
export async function approve(reportId: string): Promise<ApproveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sessão expirada.' };

  const report = await loadReport(supabase, reportId);
  if (!report) return { error: 'Relatório não encontrado.' };
  if (report.status !== 'editing') {
    return { error: 'O relatório não está em edição.' };
  }

  // O working.docx editado já está no Storage (salvo pelo Collabora via WOPI) — ele
  // É o registro do documento. Audita a transição (snapshot do binário fica no Storage).
  await audit(supabase, {
    reportId,
    actor: user.id,
    action: 'document_snapshot',
    payload: { reason: 'pré-aprovação', source: 'working.docx' },
  });

  try {
    await transition(supabase, reportId, 'editing', 'approved', user.id);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Falha ao aprovar.',
    };
  }

  // Enfileira a geração do PDF. Falha no enfileiramento é auditada mas não
  // reverte a aprovação — o operador pode re-enfileirar (re-aprovar).
  try {
    await enqueueGeneratePdf({ reportId });
    await audit(supabase, {
      reportId,
      actor: user.id,
      action: 'pdf_enqueued',
      payload: null,
    });
  } catch (err) {
    await audit(supabase, {
      reportId,
      actor: user.id,
      action: 'pdf_enqueue_failed',
      payload: { message: err instanceof Error ? err.message : String(err) },
    });
    return { error: 'Aprovado, mas falha ao enfileirar o PDF. Tente novamente.' };
  }

  return { ok: true };
}

/**
 * URL do editor Collabora embutido (012/T-003). Verifica o usuário, garante que o
 * `working.docx` já existe (senão `pending` — o worker ainda está montando) e devolve
 * a URL do iframe (discovery + WOPISrc + access_token). `canWrite` só em `editing`;
 * approved/generated abrem em leitura.
 */
export async function getEditorUrl(
  reportId: string,
): Promise<{ url: string } | { pending: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sessão expirada.' };

  const { data } = await supabase
    .from('reports')
    .select('status, working_docx_path')
    .eq('id', reportId)
    .maybeSingle();
  const report = data as { status: string; working_docx_path: string | null } | null;
  if (!report) return { error: 'Relatório não encontrado.' };

  // O working.docx já foi montado? (o worker pode ainda estar processando o build)
  const svc = createServiceClient();
  const { data: files } = await svc.storage.from('reports').list(reportId, { search: 'working.docx' });
  if (!(files ?? []).some((f) => f.name === 'working.docx')) return { pending: true };

  const canWrite = report.status === 'editing';
  const token = signToken({ reportId, userId: user.id, canWrite });
  const urlsrc = await getEditorUrlSrc('docx');
  const wopiSrc = `${process.env['WOPI_PUBLIC_URL'] ?? ''}/api/wopi/files/${reportId}`;
  const sep = urlsrc.endsWith('?') || urlsrc.endsWith('&') ? '' : urlsrc.includes('?') ? '&' : '?';
  const url = `${urlsrc}${sep}WOPISrc=${encodeURIComponent(wopiSrc)}&access_token=${encodeURIComponent(token)}&lang=pt-BR`;
  return { url };
}

/**
 * Pré-visualização FIEL: enfileira a geração do PDF REAL (mesmo do download) sem
 * transicionar o estado. Remove o preview anterior para o polling detectar o novo.
 */
export async function generatePreview(
  reportId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sessão expirada.' };

  const report = await loadReport(supabase, reportId);
  if (!report) return { error: 'Relatório não encontrado.' };

  const svc = createServiceClient();
  await svc.storage.from('reports').remove([`${reportId}/preview.pdf`]).catch(() => {
    /* não existia */
  });
  try {
    await enqueuePreviewPdf({ reportId });
  } catch {
    return { error: 'Falha ao enfileirar a pré-visualização.' };
  }
  return { ok: true };
}

/** URL assinada do preview.pdf quando pronto; `pending` enquanto o worker gera. */
export async function getPreviewUrl(
  reportId: string,
): Promise<{ url: string } | { pending: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sessão expirada.' };

  const svc = createServiceClient();
  const { data: files } = await svc.storage.from('reports').list(reportId, { limit: 100 });
  if (!(files ?? []).some((f) => f.name === 'preview.pdf')) return { pending: true };

  const { data, error } = await svc.storage
    .from('reports')
    .createSignedUrl(`${reportId}/preview.pdf`, 600);
  if (error || !data?.signedUrl) return { pending: true };
  return { url: data.signedUrl };
}

/** Status do PDF para o polling (008/T-009, RF-29). */
export async function getPdfStatus(reportId: string): Promise<PdfStatus | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sessão expirada.' };

  const report = await loadReport(supabase, reportId);
  if (!report) return { error: 'Relatório não encontrado.' };

  return {
    status: report.status as ReportStatus,
    hasPdf: (report.pdf_paths?.length ?? 0) > 0,
  };
}

/**
 * URL assinada de download do PDF final (008/T-009, RNF-05). Só disponível em
 * `generated`. TTL ≤ 10 min. Assina com service role (bucket privado).
 */
export async function getDownloadUrl(
  reportId: string,
): Promise<{ url: string } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sessão expirada.' };

  const report = await loadReport(supabase, reportId);
  if (!report) return { error: 'Relatório não encontrado.' };
  if (report.status !== 'generated') {
    return { error: 'O PDF ainda não está pronto.' };
  }
  // Versão mais recente (pdf_paths acumula final-v{n}.pdf — 010/T-005).
  const path = report.pdf_paths?.[report.pdf_paths.length - 1];
  if (!path) return { error: 'PDF não encontrado.' };

  const svc = createServiceClient();
  const { data, error } = await svc.storage
    .from('reports')
    .createSignedUrl(path, 600);
  if (error || !data?.signedUrl) {
    return { error: 'Falha ao gerar o link de download.' };
  }
  return { url: data.signedUrl };
}
