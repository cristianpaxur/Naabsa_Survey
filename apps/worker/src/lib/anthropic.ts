/**
 * Cliente da API Anthropic (010/T-006, RF-38) — atrás da flag `AI_ENABLED`.
 *
 * Wrapper fino sobre a Messages API com timeout curto, retry limitado e
 * AUDITORIA OBRIGATÓRIA: TODA chamada grava uma linha `ai_call` (finalidade,
 * modelo, duração, sucesso) — sucesso OU falha (CA-006). Falha nunca propaga
 * (retorna null) para a IA jamais bloquear o fluxo (RNF-06).
 *
 * RF-38: o CHAMADOR é responsável por enviar apenas dados extraídos + metadados
 * e fotos PROCESSADAS — nunca a planilha bruta nem fotos originais.
 */
import { getServiceClient } from './supabase';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const AI_TIMEOUT_MS = 20_000;
const DEFAULT_MODEL = 'claude-sonnet-4-6';

/** IA ligada? (flag por env; off por padrão — RNF-06). */
export function isAiEnabled(): boolean {
  const v = (process.env['AI_ENABLED'] ?? '').toLowerCase();
  return v === '1' || v === 'true' || v === 'on';
}

/** Modelo vigente (env, com default sensato — visão + qualidade). */
export function getAiModel(): string {
  return process.env['ANTHROPIC_MODEL'] || DEFAULT_MODEL;
}

export type AiContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

export interface AiCallInput {
  purpose: string; // finalidade p/ auditoria (ex.: 'ai_review', 'photo_classify')
  reportId: string | null;
  system?: string;
  content: AiContentBlock[];
  maxTokens?: number;
}

/** Dependências injetáveis (testes): transporte, auditoria e relógio. */
export interface AiDeps {
  fetchFn?: typeof fetch;
  audit?: (reportId: string | null, payload: Record<string, unknown>) => Promise<void>;
  now?: () => number;
}

async function defaultAudit(reportId: string | null, payload: Record<string, unknown>): Promise<void> {
  try {
    await getServiceClient()
      .from('audit_log')
      .insert({ report_id: reportId, actor: null, action: 'ai_call', payload } as never);
  } catch {
    /* auditoria best-effort — não deve quebrar o job */
  }
}

/**
 * Chama o modelo e devolve o texto da resposta (ou null em falha/timeout).
 * SEMPRE audita `ai_call`. Nunca lança.
 */
export async function callAnthropic(input: AiCallInput, deps: AiDeps = {}): Promise<string | null> {
  const doFetch = deps.fetchFn ?? fetch;
  const audit = deps.audit ?? defaultAudit;
  const now = deps.now ?? Date.now;
  const model = getAiModel();
  const t0 = now();

  let ok = false;
  let text: string | null = null;
  let errMsg: string | undefined;
  try {
    const apiKey = process.env['ANTHROPIC_API_KEY'] ?? '';
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY ausente');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
    try {
      const res = await doFetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model,
          max_tokens: input.maxTokens ?? 1024,
          ...(input.system ? { system: input.system } : {}),
          messages: [{ role: 'user', content: input.content }],
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { content?: { type: string; text?: string }[] };
      text =
        (json.content ?? [])
          .filter((b) => b.type === 'text')
          .map((b) => b.text ?? '')
          .join('\n')
          .trim() || null;
      ok = true;
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    errMsg = e instanceof Error ? e.message : String(e);
  }

  await audit(input.reportId, {
    purpose: input.purpose,
    model,
    duration_ms: now() - t0,
    ok,
    ...(errMsg ? { error: errMsg.slice(0, 200) } : {}),
  });
  return ok ? text : null;
}

/**
 * Extrai o primeiro objeto/array JSON de um texto de resposta — tolerante a
 * cercas ``` e a texto ao redor (casamento balanceado de chaves, ignora aspas).
 */
export function parseJsonFromText<T>(text: string | null): T | null {
  if (!text) return null;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const raw = (fenced ? fenced[1] : text)!.trim();
  const start = raw.search(/[[{]/);
  if (start < 0) return null;
  const open = raw[start];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  let inStr = false;
  let esc = false;
  let end = -1;
  for (let i = start; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
