'use server';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { audit } from '@/lib/audit';
import { transition, type ReportStatus } from '@/lib/state-machine';
import { supportsReport } from '@/lib/supported-reports';
import { revalidatePath } from 'next/cache';

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
  if (!supportsReport(type.slug))
    return { error: 'Este tipo de relatório ainda não está disponível.' };
  if (!type.active_spec_id) {
    return {
      error:
        'Este tipo ainda não tem um modelo ativo. Entre em contato com o administrador.',
    };
  }
  if (
    (type.variants.length > 0 &&
      (!input.variant || !type.variants.includes(input.variant))) ||
    (type.variants.length === 0 && input.variant !== null)
  ) {
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
  const dirs = [
    '',
    'photos/original',
    'photos/processed',
    'photos/thumbs',
    'sheets',
    'snapshots',
    'working',
  ];
  for (const dir of dirs) {
    const path = dir ? `${prefix}/${dir}` : prefix;
    const { data } = await svc.storage
      .from('reports')
      .list(path, { limit: 1000 });
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

/** Move qualquer relatório ativo para a lixeira sem remover dados ou arquivos. */
export async function trashReport(reportId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sessão expirada.' };

  const deletedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from('reports')
    .update({
      deleted_at: deletedAt,
      deleted_by: user.id,
      wopi_lock: null,
      wopi_lock_expires_at: null,
    } as never)
    .eq('id', reportId)
    .is('deleted_at', null)
    .select('id,status')
    .maybeSingle();
  if (error) return { error: 'Falha ao mover o relatório para a lixeira.' };
  const row = data as { id: string; status: string } | null;
  if (!row) return { error: 'Relatório não encontrado ou já está na lixeira.' };

  await audit(supabase, {
    reportId,
    actor: user.id,
    action: 'report_trashed',
    payload: { status: row.status, deleted_at: deletedAt },
  });
  revalidatePath('/dashboard');
  revalidatePath('/trash');
  return { ok: true };
}

/** Restaura um relatório da lixeira mantendo seu estado e seus artefatos. */
export async function restoreReport(reportId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sessão expirada.' };

  const { data, error } = await supabase
    .from('reports')
    .update({ deleted_at: null, deleted_by: null } as never)
    .eq('id', reportId)
    .not('deleted_at', 'is', null)
    .select('id')
    .maybeSingle();
  if (error) return { error: 'Falha ao restaurar o relatório.' };
  if (!data) return { error: 'Relatório não encontrado ou já foi restaurado.' };

  await audit(supabase, {
    reportId,
    actor: user.id,
    action: 'report_restored',
  });
  revalidatePath('/dashboard');
  revalidatePath('/trash');
  return { ok: true };
}

/** Apaga definitivamente apenas um relatório que já esteja na lixeira. */
export async function permanentlyDeleteReport(
  reportId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sessão expirada.' };

  const { data } = await supabase
    .from('reports')
    .select('id,deleted_at')
    .eq('id', reportId)
    .maybeSingle();
  const row = data as { id: string; deleted_at: string | null } | null;
  if (!row) return { error: 'Relatório não encontrado.' };
  if (!row.deleted_at)
    return { error: 'Mova o relatório para a lixeira antes de apagá-lo.' };

  const svc = createServiceClient();
  const { error, count } = await svc
    .from('reports')
    .delete({ count: 'exact' })
    .eq('id', reportId)
    .not('deleted_at', 'is', null);
  if (error) return { error: 'Falha ao excluir o relatório definitivamente.' };
  if (count !== 1)
    return {
      error: 'O relatório foi restaurado em outra sessão; exclusão cancelada.',
    };
  await removeStoragePrefix(svc, reportId);

  console.log(
    `[reports] relatório ${reportId} excluído definitivamente por ${user.id}`,
  );
  revalidatePath('/trash');
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
    .is('deleted_at', null)
    .maybeSingle();
  const status = (data as { status: string } | null)?.status as
    | ReportStatus
    | undefined;
  if (!status) return { error: 'Relatório não encontrado.' };
  if (status !== 'extracted' && status !== 'in_review') {
    return {
      error: 'O reenvio de planilha só vale antes da edição do documento.',
    };
  }

  try {
    await transition(supabase, reportId, status, 'draft', user.id);
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : 'Falha ao reiniciar o relatório.',
    };
  }

  const svc = createServiceClient();
  await svc
    .from('reports')
    .update({
      extracted_data: null,
      extraction_issues: null,
      extracted_number_formats: {},
      operator_overrides: null,
      operator_number_formats: {},
      ai_review: null,
      spreadsheet_path: null,
      vessel_name: null,
      working_docx_path: null,
    } as never)
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
