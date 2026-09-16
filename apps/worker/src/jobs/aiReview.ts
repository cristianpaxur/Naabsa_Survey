/**
 * Job `ai_review` — implementação 010/T-007 (RF-36), atrás da flag `AI_ENABLED`.
 *
 * Pós-extração: envia os DADOS EXTRAÍDOS + metadados do spec (rótulo/tipo/limites)
 * — nunca a planilha bruta (RF-38) — e transforma o retorno em issues de nível
 * `warning` origem `ai`, mescladas em `extraction_issues` (a revisão 006 já as
 * renderiza). Off ou falha/timeout → no-op (fluxo idêntico; RNF-06). Idempotente.
 */
import { getServiceClient } from '../lib/supabase';
import { randomUUID } from 'node:crypto';
import {
  collectFields,
  resolveFieldValue,
  type ReportSpec,
  type FieldValue,
  type Issue,
} from '@naabsa/core';
import {
  callLLM,
  isAiEnabled,
  parseJsonFromText,
  type AiDeps,
} from '../lib/llm';

export const AI_REVIEW_QUEUE = 'ai_review';
export interface AiReviewPayload {
  reportId: string;
  dataRevision?: number;
  runId?: string;
}
export interface AiReviewDelivery {
  jobId: string;
  attempt: number;
}

interface AiWarning {
  field: string;
  message: string;
}

/** Falha de infraestrutura deve voltar à fila; o estado running pode ser retomado. */
class RetryableAiReviewError extends Error {}

/** Monta o prompt a partir dos campos do spec + valores extraídos (sem planilha bruta). */
export function buildReviewPrompt(
  spec: ReportSpec,
  variant: string | null,
  data: Record<string, FieldValue>,
): { system: string; userText: string } {
  const fields = collectFields(spec, variant).map(([name, def]) => {
    const value = data[name] ?? null;
    return {
      field: name,
      label: def.label,
      type: def.type,
      ...(def.unit ? { unit: def.unit } : {}),
      ...(def.type === 'number' && def.decimals != null
        ? {
            decimals: def.decimals,
            display_value:
              typeof value === 'number'
                ? value.toFixed(def.decimals)
                : value,
          }
        : {}),
      ...(def.min != null ? { min: def.min } : {}),
      ...(def.max != null ? { max: def.max } : {}),
      value,
    };
  });
  const system =
    'Você é um revisor de dados de Draft Survey (vistoria marítima de calado). ' +
    'Receberá campos extraídos de uma planilha (rótulo, tipo, unidade, limites, precisão de exibição e valor). ' +
    'Zeros decimais à direita são metadados de exibição: o JSON numérico 81 e o display_value 81.0 representam o mesmo valor informado. ' +
    'Nos campos net_tonnage, gross_tonnage e summer_dwt com decimals=1 e valor positivo menor que 1000, ' +
    'a planilha de Draft Survey usa a convenção de milhares de toneladas (por exemplo, 81.0 representa cerca de 81 mil toneladas). ' +
    'Aplique essa convenção antes de comparar tonelagem com as dimensões do navio e não sinalize truncamento apenas por essa escala. ' +
    'Sinalize APENAS valores claramente suspeitos: fora dos limites, formato implausível ou ' +
    'contradições óbvias entre campos relacionados. Não invente campos. Seja conservador — ' +
    'poucos avisos, alta precisão. Nunca bloqueie; apenas sugira.';
  const userText =
    `Campos:\n${JSON.stringify(fields)}\n\n` +
    'Responda SOMENTE um array JSON de objetos {"field":"<nome exato do campo>","message":"<aviso curto em pt-BR>","related_fields":["<todos os campos usados para chegar ao aviso, incluindo field>"]}. ' +
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
    if (!w || typeof w.field !== 'string' || typeof w.message !== 'string')
      continue;
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

export async function aiReview(
  payload: AiReviewPayload,
  deps: AiDeps = {},
  delivery?: AiReviewDelivery,
): Promise<void> {
  const { reportId } = payload;
  const svc = getServiceClient();

  const { data: report, error: reportError } = await svc
    .from('reports')
    .select(
      'spec_id, variant, extracted_data, operator_overrides, extraction_issues, status, data_revision, ai_review',
    )
    .eq('id', reportId)
    .is('deleted_at', null)
    .maybeSingle();
  if (reportError)
    throw new RetryableAiReviewError(
      'Não foi possível consultar a revisão de IA.',
    );
  const r = report as {
    spec_id: string;
    variant: string | null;
    extracted_data: Record<string, FieldValue> | null;
    extraction_issues: Issue[] | null;
    operator_overrides: Record<string, FieldValue> | null;
    data_revision: number;
    ai_review: {
      status?: string;
      runId?: string;
      executionId?: string;
      jobId?: string;
      attempt?: number;
      data?: Record<string, FieldValue>;
      dependencies?: Record<string, string[]>;
    } | null;
    status: string;
  } | null;
  if (!r || !r.extracted_data) return;
  // Só faz sentido antes da edição; não mexe em relatórios já adiantados.
  if (r.status !== 'extracted' && r.status !== 'in_review') return;
  if (
    payload.dataRevision !== undefined &&
    payload.dataRevision !== r.data_revision
  )
    return;
  if (
    payload.runId &&
    (r.ai_review?.runId !== payload.runId ||
      !['queued', 'running'].includes(r.ai_review.status ?? ''))
  )
    return;
  if (delivery && r.ai_review?.status === 'running' && r.ai_review.jobId) {
    // Só uma entrega posterior do mesmo job retoma a execução interrompida.
    // Duplicatas da mesma tentativa (ou de outro job) não repetem a chamada paga.
    if (
      r.ai_review.jobId !== delivery.jobId ||
      (r.ai_review.attempt ?? -1) >= delivery.attempt
    )
      return;
  }
  const runId = payload.runId ?? randomUUID();
  // Cada entrega obtém uma identidade nova. Uma entrega expirada não publica
  // depois que a fila retomou o mesmo runId em outra execução.
  const executionId = randomUUID();
  const baseState = {
    data: r.ai_review?.data,
    dependencies: r.ai_review?.dependencies,
    runId,
    executionId,
    revision: r.data_revision,
    jobId: delivery?.jobId,
    attempt: delivery?.attempt,
  };
  const claim = svc
    .from('reports')
    .update({
      ai_review: {
        ...baseState,
        status: isAiEnabled() ? 'running' : 'disabled',
        updatedAt: new Date().toISOString(),
      },
    } as never)
    .eq('id', reportId)
    .eq('data_revision', r.data_revision)
    .in('status', ['extracted', 'in_review']);
  if (payload.runId) {
    claim
      .eq('ai_review->>runId', runId)
      .eq('ai_review->>status', r.ai_review!.status!);
    if (r.ai_review?.executionId)
      claim.eq('ai_review->>executionId', r.ai_review.executionId);
    else claim.is('ai_review->>executionId', null);
  }
  const { data: claimed, error: claimError } = await claim
    .select('id')
    .maybeSingle();
  if (claimError)
    throw new RetryableAiReviewError(
      'Não foi possível registrar a análise de IA.',
    );
  if (!claimed || !isAiEnabled()) return;

  const persist = async (patch: Record<string, unknown>) => {
    try {
      const result = await svc
        .from('reports')
        .update(patch as never)
        .eq('id', reportId)
        .eq('data_revision', r.data_revision)
        .eq('ai_review->>runId', runId)
        .eq('ai_review->>executionId', executionId)
        .eq('ai_review->>status', 'running')
        .in('status', ['extracted', 'in_review'])
        .select('id')
        .maybeSingle();
      if (result.error) throw result.error;
      return result;
    } catch {
      throw new RetryableAiReviewError(
        'Não foi possível persistir a revisão de IA.',
      );
    }
  };
  // Consulta fora do tratamento de erro do modelo: indisponibilidade do banco
  // deixa running retomável e é propagada ao retry do pg-boss.
  const { data: specRow, error: specError } = await svc
    .from('report_specs')
    .select('spec')
    .eq('id', r.spec_id)
    .maybeSingle();
  if (specError)
    throw new RetryableAiReviewError(
      'Não foi possível consultar o spec para a revisão de IA.',
    );
  try {
    const spec = (specRow as { spec: ReportSpec } | null)?.spec;
    if (!spec) throw new Error('spec_missing');
    const cells = new Map<string, string | null>();
    const effective: Record<string, FieldValue> = {};
    for (const [name, def] of collectFields(spec, r.variant)) {
      cells.set(name, def.cell ?? null);
      effective[name] = resolveFieldValue(
        name,
        r.operator_overrides ?? {},
        r.extracted_data,
      );
    }
    const valid = new Set(cells.keys());
    const { system, userText } = buildReviewPrompt(spec, r.variant, effective);
    const text = await callLLM(
      {
        purpose: 'ai_review',
        reportId,
        system,
        content: [{ type: 'text', text: userText }],
        maxTokens: 2048,
      },
      deps,
    );
    const warnings = parseJsonFromText<unknown>(text);
    if (!Array.isArray(warnings)) throw new Error('invalid_response');
    // JSON inválido não é um resultado vazio bem-sucedido.
    if (
      warnings.some(
        (w: unknown) =>
          !w ||
          typeof w !== 'object' ||
          typeof (w as AiWarning).field !== 'string' ||
          typeof (w as AiWarning).message !== 'string',
      )
    )
      throw new Error('invalid_response');
    const aiIssues = aiWarningsToIssues(
      warnings,
      valid,
      (f) => cells.get(f) ?? null,
    );
    const dependencies: Record<string, string[]> = {};
    for (const w of warnings as (AiWarning & { related_fields?: unknown })[]) {
      if (!valid.has(w.field)) continue;
      const fields =
        Array.isArray(w.related_fields) &&
        w.related_fields.every((f) => typeof f === 'string' && valid.has(f))
          ? (w.related_fields as string[])
          : [...valid]; // sem proveniência: invalidação conservadora
      dependencies[w.field] = [
        ...new Set([w.field, ...(dependencies[w.field] ?? []), ...fields]),
      ];
    }
    const kept = (r.extraction_issues ?? []).filter((i) => i.origin !== 'ai');
    const { data: saved } = await persist({
      extraction_issues: [...kept, ...aiIssues],
      ai_review: {
        ...baseState,
        status: 'done',
        updatedAt: new Date().toISOString(),
        data: effective,
        dependencies,
      },
    });
    if (!saved) return; // dados/etapa mudaram enquanto a IA respondia
    await svc
      .from('audit_log')
      .insert({
        report_id: reportId,
        actor: null,
        action: 'ai_review',
        payload: { warnings: aiIssues.length, revision: r.data_revision },
      } as never);
  } catch (error) {
    if (error instanceof RetryableAiReviewError) throw error;
    await persist({
      ai_review: {
        ...baseState,
        status: 'error',
        updatedAt: new Date().toISOString(),
        error:
          'A IA não conseguiu concluir a revisão. Tente novamente; o fluxo manual continua disponível.',
      },
    });
  }
}
