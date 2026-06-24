'use server';

import { createClient } from '@/lib/supabase/server';
import { transition } from '@/lib/state-machine';

export type RegenerateResult = { ok: true } | { error: string };

/**
 * Regeneração (010/T-004, RF-30). Em `generated`, reabre o relatório para edição
 * (`generated → editing`) mantendo o `document_json`. O novo ciclo editar→aprovar
 * gera um PDF versionado (`final-v{n}.pdf`, ver generate_pdf). Revalida o status
 * contra concorrência (a transição usa guarda otimista).
 */
export async function regenerate(reportId: string): Promise<RegenerateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sessão expirada.' };

  const { data: row } = await supabase
    .from('reports')
    .select('status')
    .eq('id', reportId)
    .maybeSingle();
  const status = (row as { status: string } | null)?.status;
  if (!status) return { error: 'Relatório não encontrado.' };
  if (status !== 'generated') {
    return { error: 'Apenas relatórios gerados podem ser regenerados.' };
  }

  try {
    // Mantém document_json — a transição só altera o status (auditada).
    await transition(supabase, reportId, 'generated', 'editing', user.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Falha ao regenerar.' };
  }
  return { ok: true };
}
