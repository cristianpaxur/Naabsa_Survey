'use server';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import type { ServerClient } from '@/lib/supabase/server';
import { audit } from '@/lib/audit';
import type { ReportStatus } from '@/lib/state-machine';
import { readSaveProof, signSaveProof } from '@/lib/document-save-proof';
import { enqueueBuildWorkingDocx, enqueueGeneratePdf, enqueuePreviewPdf } from '@/lib/queue';
import { latestJobOutcome, type AuditEventRow, type JobOutcome } from '@/lib/job-failure';
import { signToken } from '@/lib/wopi/token';
import { getEditorUrlSrc } from '@/lib/wopi/discovery';

export type ApproveResult = { ok: true } | { error: string; approved?: boolean };

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
  working_docx_path: string | null;
  working_docx_revision: number;
  working_docx_generation: string;
  approved_docx_revision: number | null;
}

async function loadReport(
  supabase: ServerClient,
  reportId: string,
): Promise<ReportRow | null> {
  const { data } = await supabase
    .from('reports')
    .select('id,status,pdf_paths,working_docx_path,working_docx_revision,working_docx_generation,approved_docx_revision')
    .eq('id', reportId)
    .maybeSingle();
  return (data as ReportRow | null) ?? null;
}

/** Começa o save forçado antes de enviar Action_Save ao Collabora. */
export async function beginDocumentSave(reportId: string): Promise<{ token: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Sessão expirada.' };
  const report = await loadReport(supabase, reportId);
  if (report?.status !== 'editing' || !report.working_docx_path) return { error: 'Documento não disponível para salvar.' };
  return { token: signSaveProof({ kind: 'request', reportId, userId: user.id,
    revision: report.working_docx_revision, path: report.working_docx_path }) };
}

/** Confirma nova revisão WOPI ou a versão estável explicitamente não modificada. */
export async function confirmDocumentSave(reportId: string, token: string, outcome: 'saved' | 'unmodified' = 'saved'): Promise<{ receipt: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Sessão expirada.' };
  const request = readSaveProof(token, 'request', reportId, user.id);
  const report = await loadReport(supabase, reportId);
  if (!request || report?.status !== 'editing' || !report.working_docx_path ||
      (outcome === 'unmodified'
        ? report.working_docx_revision !== request.revision || report.working_docx_path !== request.path
        : outcome !== 'saved' || report.working_docx_revision <= request.revision)) {
    return { error: 'O servidor ainda não confirmou o salvamento. Volte ao editor e tente salvar novamente.' };
  }
  return { receipt: signSaveProof({ kind: 'saved', reportId, userId: user.id,
    revision: report.working_docx_revision, path: report.working_docx_path }) };
}

/** Congela exatamente a revisão confirmada; um save concorrente invalida o recibo. */
export async function approve(reportId: string, receipt?: string): Promise<ApproveResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Sessão expirada.' };
  const proof = readSaveProof(receipt, 'saved', reportId, user.id);
  if (!proof) return { error: 'Salve o documento no editor antes de aprovar.' };
  const { error, count } = await supabase.from('reports').update({
    status: 'approved', approved_docx_path: proof.path, approved_docx_revision: proof.revision,
  } as never, { count: 'exact' }).eq('id', reportId).eq('status', 'editing')
    .eq('working_docx_revision', proof.revision).eq('working_docx_path', proof.path);
  if (error || count !== 1) return { error: 'O documento mudou ou não está em edição. Volte ao editor e salve novamente.' };

  // O próprio objeto imutável é o snapshot. Nenhuma cópia posterior à aprovação
  // pode falhar ou observar bytes diferentes dos confirmados pelo operador.
  await audit(supabase, { reportId, actor: user.id, action: 'transition', payload: { from: 'editing', to: 'approved' } });
  await audit(supabase, { reportId, actor: user.id, action: 'document_snapshot',
    payload: { snapshot_path: proof.path, revision: proof.revision } });
  try {
    await enqueueGeneratePdf({ reportId, approvedRevision: proof.revision });
    await audit(supabase, { reportId, actor: user.id, action: 'pdf_enqueued', payload: { revision: proof.revision } });
  } catch (err) {
    await audit(supabase, { reportId, actor: user.id, action: 'pdf_enqueue_failed',
      payload: { message: err instanceof Error ? err.message : String(err), revision: proof.revision } });
    return { error: 'Documento aprovado. Não foi possível iniciar o PDF; tente gerar novamente.', approved: true };
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

  if (!report.working_docx_path) {
    const rows = await loadJobEvents(supabase, reportId, [
      'working_docx_enqueued',
      'working_docx_failed',
      'working_docx_enqueue_failed',
    ]);
    const outcome = latestJobOutcome(rows, 'working_docx_enqueued', ['working_docx_failed', 'working_docx_enqueue_failed']);
    if (outcome.failed || rows.length === 0) {
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
 * Encerra um lock WOPI órfão antes de recriar o iframe do editor.
 *
 * O Collabora mantém o lock por até 30 minutos. Se o iframe, navegador ou
 * container for interrompido antes do UNLOCK, uma nova sessão recebe 409 e é
 * aberta somente para leitura. Esta ação só é chamada pelo botão explícito
 * "Reabrir editor", depois que o iframe anterior é desmontado.
 */
export async function reopenDocumentEditor(
  reportId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sessão expirada.' };

  const report = await loadReport(supabase, reportId);
  if (report?.status !== 'editing' || !report.working_docx_path) {
    return { error: 'Documento não disponível para reabrir em edição.' };
  }

  const { error, count } = await supabase
    .from('reports')
    .update({ wopi_lock: null, wopi_lock_expires_at: null } as never, { count: 'exact' })
    .eq('id', reportId)
    .eq('status', 'editing');
  if (error || count !== 1) {
    return { error: 'Não foi possível liberar a sessão anterior do editor. Tente novamente.' };
  }

  await audit(supabase, {
    reportId,
    actor: user.id,
    action: 'wopi_lock_released',
    payload: { reason: 'explicit_editor_reopen' },
  });
  return { ok: true };
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
    await audit(supabase, { reportId, actor: user.id, action: 'preview_enqueue_failed', payload: { message: 'Falha ao enfileirar a pré-visualização.' } });
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

  if (!await loadReport(supabase, reportId)) return { error: 'Relatório não encontrado.' };

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
  actions: string[],
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
    const rows = await loadJobEvents(supabase, reportId, ['pdf_enqueued', 'pdf_generation_failed', 'pdf_enqueue_failed']);
    outcome = rows.length ? latestJobOutcome(rows, 'pdf_enqueued', ['pdf_generation_failed', 'pdf_enqueue_failed']) : { failed: true, reason: 'O PDF ainda não foi enfileirado.' };
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
    await enqueueGeneratePdf({ reportId, approvedRevision: report.approved_docx_revision ?? report.working_docx_revision });
  } catch {
    await audit(supabase, { reportId, actor: user.id, action: 'pdf_enqueue_failed', payload: { message: 'Falha ao re-enfileirar o PDF.' } });
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
    if (report.working_docx_path) return { ok: true };
    await enqueueBuildWorkingDocx({ reportId, generation: report.working_docx_generation }, { dedupe: false });
  } catch {
    await audit(supabase, { reportId, actor: user.id, action: 'working_docx_enqueue_failed', payload: { message: 'Falha ao re-enfileirar a montagem.' } });
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
