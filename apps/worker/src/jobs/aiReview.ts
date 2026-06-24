/**
 * Job `ai_review` — implementação 010/T-007 (RF-36), atrás da flag `AI_ENABLED`.
 *
 * Pós-extração: envia os DADOS EXTRAÍDOS + metadados do spec (rótulo/tipo/limites)
 * — nunca a planilha bruta (RF-38) — e transforma o retorno em issues de nível
 * `warning` origem `ai`, mescladas em `extraction_issues` (a revisão 006 já as
 * renderiza). Off ou falha/timeout → no-op (fluxo idêntico; RNF-06). Idempotente.
 */
import { getServiceClient } from '../lib/supabase';
import {
  collectFields,
  type ReportSpec,
  type FieldValue,
  type Issue,
} from '@naabsa/core';
import { callAnthropic, isAiEnabled, parseJsonFromText, type AiDeps } from '../lib/anthropic';

export const AI_REVIEW_QUEUE = 'ai_review';
export interface AiReviewPayload {
  reportId: string;
}

interface AiWarning {
  field: string;
  message: string;
}

/** Monta o prompt a partir dos campos do spec + valores extraídos (sem planilha bruta). */
export function buildReviewPrompt(
  spec: ReportSpec,
  variant: string | null,
  data: Record<string, FieldValue>,
): { system: string; userText: string } {
  const fields = collectFields(spec, variant).map(([name, def]) => ({
    field: name,
    label: def.label,
    type: def.type,
    ...(def.unit ? { unit: def.unit } : {}),
    ...(def.min != null ? { min: def.min } : {}),
    ...(def.max != null ? { max: def.max } : {}),
    value: data[name] ?? null,
  }));
  const system =
    'Você é um revisor de dados de Draft Survey (vistoria marítima de calado). ' +
    'Receberá campos extraídos de uma planilha (rótulo, tipo, unidade, limites e valor). ' +
    'Sinalize APENAS valores claramente suspeitos: fora dos limites, formato implausível ou ' +
    'contradições óbvias entre campos relacionados. Não invente campos. Seja conservador — ' +
    'poucos avisos, alta precisão. Nunca bloqueie; apenas sugira.';
  const userText =
    `Campos:\n${JSON.stringify(fields)}\n\n` +
    'Responda SOMENTE um array JSON de objetos {"field":"<nome exato do campo>","message":"<aviso curto em pt-BR>"}. ' +
    'Array vazio [] se nada suspeito.';
  return { system, userText };
}

/** Converte a resposta da IA em Issues (origem ai); descarta campos fora do spec (alucinação). */
export function aiWarningsToIssues(
  warnings: unknown,
  validFields: Set<string>,
  cellOf: (f: string) => string | null,
): Issue[] {
  if (!Array.isArray(warnings)) return [];
  const out: Issue[] = [];
  for (const w of warnings as AiWarning[]) {
    if (!w || typeof w.field !== 'string' || typeof w.message !== 'string') continue;
    if (!validFields.has(w.field)) continue; // alucinação / campo inexistente → descarta
    out.push({
      field: w.field,
      cell: cellOf(w.field),
      level: 'warning',
      message: w.message.slice(0, 300),
      origin: 'ai',
    });
  }
  return out;
}

export async function aiReview(payload: AiReviewPayload, deps: AiDeps = {}): Promise<void> {
  if (!isAiEnabled()) return; // flag off → no-op (RNF-06)
  const { reportId } = payload;
  const svc = getServiceClient();

  const { data: report } = await svc
    .from('reports')
    .select('spec_id, variant, extracted_data, extraction_issues, status')
    .eq('id', reportId)
    .single();
  const r = report as {
    spec_id: string;
    variant: string | null;
    extracted_data: Record<string, FieldValue> | null;
    extraction_issues: Issue[] | null;
    status: string;
  } | null;
  if (!r || !r.extracted_data) return;
  // Só faz sentido antes da edição; não mexe em relatórios já adiantados.
  if (r.status !== 'extracted' && r.status !== 'in_review') return;

  const { data: specRow } = await svc.from('report_specs').select('spec').eq('id', r.spec_id).single();
  const spec = (specRow as { spec: ReportSpec } | null)?.spec;
  if (!spec) return;

  const { system, userText } = buildReviewPrompt(spec, r.variant, r.extracted_data);
  const text = await callAnthropic(
    { purpose: 'ai_review', reportId, system, content: [{ type: 'text', text: userText }], maxTokens: 1024 },
    deps,
  );

  // Campos válidos + suas células (descarta alucinações).
  const cells = new Map<string, string | null>();
  const valid = new Set<string>();
  for (const [name, def] of collectFields(spec, r.variant)) {
    valid.add(name);
    cells.set(name, def.cell ?? null);
  }
  const aiIssues = aiWarningsToIssues(parseJsonFromText(text), valid, (f) => cells.get(f) ?? null);

  // Mescla: remove issues ai anteriores (idempotência) + adiciona as novas.
  if (aiIssues.length > 0) {
    const kept = (r.extraction_issues ?? []).filter((i) => i.origin !== 'ai');
    await svc
      .from('reports')
      .update({ extraction_issues: [...kept, ...aiIssues] } as never)
      .eq('id', reportId);
  }
  await svc.from('audit_log').insert({
    report_id: reportId,
    actor: null,
    action: 'ai_review',
    payload: { warnings: aiIssues.length },
  } as never);
  console.log(`[ai_review] ${reportId}: ${aiIssues.length} aviso(s) de IA.`);
}
