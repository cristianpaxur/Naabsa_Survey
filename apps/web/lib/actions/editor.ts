'use server';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import type { ServerClient } from '@/lib/supabase/server';
import { audit } from '@/lib/audit';
import { transition, type ReportStatus } from '@/lib/state-machine';
import { enqueueBuildWorkingDocx, enqueueGeneratePdf, enqueuePreviewPdf } from '@/lib/queue';
import { latestJobOutcome, type AuditEventRow, type JobOutcome } from '@/lib/job-failure';
import { signToken } from '@/lib/wopi/token';
import { getEditorUrlSrc } from '@/lib/wopi/discovery';

export type ApproveResult = { ok: true } | { error: string };

export interface PdfStatus {
  status: ReportStatus;
  hasPdf: boolean;
  /** Falha DEFINITIVA do generate_pdf (dead-letter do worker — 014/RF-002). */
  failed: boolean;
  failReason?: string;
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
 * Aprovação (012/T-007, RF-26). O working.docx editado (salvo pelo Collabora via
 * WOPI) É o documento. Transiciona `editing → approved` — a partir daí o WOPI
 * rejeita PutFile, congelando o binário —, grava um snapshot (cópia do
 * working.docx no Storage), enfileira `generate_pdf` e audita. Revalida o status
 * contra concorrência (a transição usa guarda otimista).
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

  try {
    await transition(supabase, reportId, 'editing', 'approved', user.id);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Falha ao aprovar.',
    };
  }

  // Snapshot pós-transição: com o PutFile bloqueado em `approved`, a cópia é
  // exatamente o binário que o generate_pdf vai converter (RNF-07).
  const svc = createServiceClient();
  const version = (report.pdf_paths?.length ?? 0) + 1;
  const snapshotPath = `${reportId}/snapshots/aprovacao-v${version}.docx`;
  const { error: copyError } = await svc.storage
    .from('reports')
    .copy(`${reportId}/working.docx`, snapshotPath);
  await audit(supabase, {
    reportId,
    actor: user.id,
    action: 'document_snapshot',
    payload: copyError
      ? { reason: 'pré-aprovação', source: 'working.docx', error: copyError.message }
      : { reason: 'pré-aprovação', source: 'working.docx', snapshot_path: snapshotPath },
  });

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
 * URL do editor Collabora embutido (012/T-003 + 014/T-005). Verifica o usuário e
 * garante que o `working.docx` já existe. Se não existe: distingue build EM
 * ANDAMENTO (`pending` — o polling continua) de build FALHADO no dead-letter
 * (`error` + `canRetry` — a UI mostra o motivo e re-enfileira). `canWrite` só em
 * `editing`; approved/generated abrem em leitura.
 */
export async function getEditorUrl(
  reportId: string,
): Promise<{ url: string } | { pending: true } | { error: string; canRetry?: boolean }> {
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
  if (!(files ?? []).some((f) => f.name === 'working.docx')) {
    const rows = await loadJobEvents(supabase, reportId, [
      'working_docx_enqueued',
      'working_docx_failed',
    ]);
    const outcome = latestJobOutcome(rows, 'working_docx_enqueued', 'working_docx_failed');
    if (outcome.failed) {
      return {
        error: `Falha ao montar o documento${outcome.reason ? `: ${outcome.reason}` : '.'}`,
        canRetry: true,
      };
    }
    return { pending: true };
  }

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

/** Últimos eventos de um par enfileirado/falhou no audit_log (mais recente 1º). */
async function loadJobEvents(
  supabase: ServerClient,
  reportId: string,
  actions: [enqueued: string, failed: string],
): Promise<AuditEventRow[]> {
  const { data } = await supabase
    .from('audit_log')
    .select('action,payload')
    .eq('report_id', reportId)
    .in('action', actions)
    .order('created_at', { ascending: false })
    .limit(10);
  return (data ?? []) as AuditEventRow[];
}

/**
 * Status do PDF para o polling (008/T-009, RF-29 + 014/T-003). Além do status,
 * reporta falha DEFINITIVA do generate_pdf (dead-letter) para a UI oferecer a
 * retentativa em vez de girar para sempre.
 */
export async function getPdfStatus(reportId: string): Promise<PdfStatus | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sessão expirada.' };

  const report = await loadReport(supabase, reportId);
  if (!report) return { error: 'Relatório não encontrado.' };

  let outcome: JobOutcome = { failed: false };
  if (report.status === 'approved') {
    const rows = await loadJobEvents(supabase, reportId, ['pdf_enqueued', 'pdf_generation_failed']);
    outcome = latestJobOutcome(rows, 'pdf_enqueued', 'pdf_generation_failed');
  }

  return {
    status: report.status as ReportStatus,
    hasPdf: (report.pdf_paths?.length ?? 0) > 0,
    failed: outcome.failed,
    ...(outcome.reason ? { failReason: outcome.reason } : {}),
  };
}

/**
 * Retentativa da geração do PDF (014/T-004, RF-002). Em `approved` com o job
 * morto no dead-letter, re-enfileira o generate_pdf e audita — o novo
 * `pdf_enqueued` supera o `pdf_generation_failed` e o polling volta ao normal.
 */
export async function retryGeneratePdf(reportId: string): Promise<ApproveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sessão expirada.' };

  const report = await loadReport(supabase, reportId);
  if (!report) return { error: 'Relatório não encontrado.' };
  if (report.status !== 'approved') {
    return { error: 'A retentativa só vale para relatórios aprovados aguardando PDF.' };
  }

  try {
    await enqueueGeneratePdf({ reportId });
  } catch {
    return { error: 'Falha ao re-enfileirar o PDF. Tente novamente.' };
  }
  await audit(supabase, {
    reportId,
    actor: user.id,
    action: 'pdf_enqueued',
    payload: { retry: true },
  });
  return { ok: true };
}

/**
 * Retentativa da montagem do working.docx (014/T-005, RF-003). Em `editing` com
 * o build morto no dead-letter, re-enfileira SEM dedupe (singleton bloquearia o
 * job novo dentro da janela) e audita.
 */
export async function retryBuildWorkingDocx(reportId: string): Promise<ApproveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sessão expirada.' };

  const report = await loadReport(supabase, reportId);
  if (!report) return { error: 'Relatório não encontrado.' };
  if (report.status !== 'editing') {
    return { error: 'O documento só é montado no estado de edição.' };
  }

  try {
    await enqueueBuildWorkingDocx({ reportId }, { dedupe: false });
  } catch {
    return { error: 'Falha ao re-enfileirar a montagem. Tente novamente.' };
  }
  await audit(supabase, {
    reportId,
    actor: user.id,
    action: 'working_docx_enqueued',
    payload: { retry: true },
  });
  return { ok: true };
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
