'use server';

import { createClient } from '@/lib/supabase/server';
import { audit } from '@/lib/audit';

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
    .select('id,active_spec_id,variants')
    .eq('id', input.reportTypeId)
    .maybeSingle();
  const type = typeData as {
    id: string;
    active_spec_id: string | null;
    variants: string[];
  } | null;

  if (!type) return { error: 'Tipo de relatório inválido.' };
  if (!type.active_spec_id) {
    return {
      error:
        'Este tipo ainda não tem um spec ativo — ative um em Admin · Specs.',
    };
  }
  if (type.variants.length > 0 && !input.variant) {
    return { error: 'Selecione a variante para continuar.' };
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
