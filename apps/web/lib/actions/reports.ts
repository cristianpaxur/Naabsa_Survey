'use server';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { audit } from '@/lib/audit';
import { transition, type ReportStatus } from '@/lib/state-machine';
import { supportsReport } from '@/lib/supported-reports';

export interface CreateReportInput {
  reportTypeId: string;
  variant: string | null;
}

export type CreateReportResult = { id: string } | { error: string };

/**
 * Cria um relatório em `draft` congelando o spec ativo do tipo (RF-05). A
 * variante (obrigatória quando o tipo a tem) é escolhida antes do upload.
 */
export async function createReport(
  input: CreateReportInput,
): Promise<CreateReportResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sessão expirada. Faça login novamente.' };

  const { data: typeData } = await supabase
    .from('report_types')
    .select('id,slug,active_spec_id,variants')
    .eq('id', input.reportTypeId)
    .maybeSingle();
  const type = typeData as {
    id: string;
    slug: string;
    active_spec_id: string | null;
    variants: string[];
  } | null;

  if (!type) return { error: 'Tipo de relatório inválido.' };
  if (!supportsReport(type.slug)) return { error: 'Este tipo de relatório ainda não está disponível.' };
  if (!type.active_spec_id) {
    return {
      error:
        'Este tipo ainda não tem um modelo ativo. Entre em contato com o administrador.',
    };
  }
  if ((type.variants.length > 0 && (!input.variant || !type.variants.includes(input.variant))) || (type.variants.length === 0 && input.variant !== null)) {
    return { error: 'Selecione uma variante válida para continuar.' };
  }

  const { data: created, error } = await supabase
    .from('reports')
    .insert({
      report_type_id: type.id,
      spec_id: type.active_spec_id,
      variant: input.variant,
      status: 'draft',
      created_by: user.id,
    } as never)
    .select('id')
    .single();
  if (error || !created) return { error: 'Falha ao criar o relatório.' };
  const id = (created as { id: string }).id;

  await audit(supabase, {
    reportId: id,
    actor: user.id,
    action: 'create',
    payload: { report_type_id: type.id, variant: input.variant },
  });

  return { id };
}

export type ActionResult = { ok: true } | { error: string };

/** Remove TODOS os blobs de um prefixo do Storage, tolerante a falha parcial. */
async function removeStoragePrefix(
  svc: ReturnType<typeof createServiceClient>,
  prefix: string,
): Promise<void> {
  // list é raso — varre os subdiretórios conhecidos do relatório.
  const dirs = ['', 'photos/original', 'photos/processed', 'photos/thumbs', 'sheets', 'snapshots', 'working'];
  for (const dir of dirs) {
    const path = dir ? `${prefix}/${dir}` : prefix;
    const { data } = await svc.storage.from('reports').list(path, { limit: 1000 });
    const files = (data ?? []).filter((f) => f.id !== null); // pastas vêm com id null
    if (files.length > 0) {
      await svc.storage
        .from('reports')
        .remove(files.map((f) => `${path}/${f.name}`))
        .catch(() => {
          /* blobs órfãos são varridos pela retenção (010) */
        });
    }
  }
}

/**
 * Descarta um relatório que nunca produziu documento (014/T-006, RF-004).
 * Restrito a `draft`/`extracted`; remove Storage, fotos, auditoria e a linha.
 * Decisão de design (spec 014 §9): o trail do audit_log sai junto — rascunho
 * descartado não tem valor de auditoria.
 */
export async function deleteReport(reportId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sessão expirada.' };

  const { data } = await supabase
    .from('reports')
    .select('status')
    .eq('id', reportId)
    .maybeSingle();
  const status = (data as { status: string } | null)?.status;
  if (!status) return { error: 'Relatório não encontrado.' };
  if (status !== 'draft' && status !== 'extracted') {
    return { error: 'Só é possível descartar relatórios em rascunho ou recém-extraídos.' };
  }

  const svc = createServiceClient();
  await removeStoragePrefix(svc, reportId);
  await svc.from('report_photos').delete().eq('report_id', reportId);
  await svc.from('audit_log').delete().eq('report_id', reportId);
  const { error } = await svc.from('reports').delete().eq('id', reportId);
  if (error) return { error: 'Falha ao descartar o relatório.' };

  console.log(`[reports] relatório ${reportId} descartado por ${user.id} (status ${status})`);
  return { ok: true };
}

/**
 * Reenvio de planilha (014/T-008, RF-005): volta a `draft` a partir de
 * `extracted`/`in_review` para refazer o upload NO MESMO relatório. Limpa
 * `operator_overrides` (referem-se à extração anterior — mantê-los sobre dados
 * novos é risco silencioso) e artefatos derivados (working.docx, preview,
 * sheets). Fotos permanecem (independem da planilha).
 */
export async function resetToDraft(reportId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sessão expirada.' };

  const { data } = await supabase
    .from('reports')
    .select('status')
    .eq('id', reportId)
    .maybeSingle();
  const status = (data as { status: string } | null)?.status as ReportStatus | undefined;
  if (!status) return { error: 'Relatório não encontrado.' };
  if (status !== 'extracted' && status !== 'in_review') {
    return { error: 'O reenvio de planilha só vale antes da edição do documento.' };
  }

  try {
    await transition(supabase, reportId, status, 'draft', user.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Falha ao reiniciar o relatório.' };
  }

  const svc = createServiceClient();
  await svc
    .from('reports')
    .update({ operator_overrides: null, working_docx_path: null } as never)
    .eq('id', reportId);
  await svc.storage
    .from('reports')
    .remove([
      `${reportId}/working.docx`,
      `${reportId}/preview.pdf`,
      `${reportId}/sheets/initial.png`,
      `${reportId}/sheets/intermediate.png`,
      `${reportId}/sheets/final.png`,
    ])
    .catch(() => {
      /* artefatos inexistentes */
    });

  await audit(supabase, {
    reportId,
    actor: user.id,
    action: 'report_reset',
    payload: { from: status, reason: 'reenvio de planilha' },
  });
  return { ok: true };
}
