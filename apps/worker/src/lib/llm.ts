/**
 * Cliente de LLM agnóstico de provedor (010/T-006, RF-38) — atrás de `AI_ENABLED`.
 *
 * Escolha do provedor por env: `AI_PROVIDER=anthropic|openai` (default anthropic).
 * Wrapper fino com timeout curto e AUDITORIA OBRIGATÓRIA: TODA chamada grava uma
 * linha `ai_call` (provedor, modelo, finalidade, duração, sucesso) — sucesso OU
 * falha (CA-006). Falha nunca propaga (retorna null) para a IA jamais bloquear o
 * fluxo (RNF-06).
 *
 * RF-38: o CHAMADOR envia apenas dados extraídos + metadados e fotos PROCESSADAS —
 * nunca a planilha bruta nem fotos originais.
 */
import { getServiceClient } from './supabase';

const AI_TIMEOUT_MS = 20_000;
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-6';
const DEFAULT_OPENAI_MODEL = 'gpt-4o';

export type AiProvider = 'anthropic' | 'openai';

/** IA ligada? (flag por env; off por padrão — RNF-06). */
export function isAiEnabled(): boolean {
  const v = (process.env['AI_ENABLED'] ?? '').toLowerCase();
  return v === '1' || v === 'true' || v === 'on';
}

/** Provedor escolhido por env (default anthropic). */
export function getAiProvider(): AiProvider {
  return (process.env['AI_PROVIDER'] ?? '').toLowerCase() === 'openai' ? 'openai' : 'anthropic';
}

/** Modelo vigente: `AI_MODEL` (override) ou default por provedor. Apara espaços. */
export function getAiModel(): string {
  const override = (process.env['AI_MODEL'] || process.env['ANTHROPIC_MODEL'] || '').trim();
  if (override) return override;
  return getAiProvider() === 'openai' ? DEFAULT_OPENAI_MODEL : DEFAULT_ANTHROPIC_MODEL;
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

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  doFetch: typeof fetch,
): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
  try {
    const res = await doFetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function callAnthropicProvider(model: string, input: AiCallInput, doFetch: typeof fetch): Promise<string | null> {
  const key = process.env['ANTHROPIC_API_KEY'] ?? '';
  if (!key) throw new Error('ANTHROPIC_API_KEY ausente');
  const json = (await postJson(
    ANTHROPIC_URL,
    { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION },
    {
      model,
      max_tokens: input.maxTokens ?? 1024,
      ...(input.system ? { system: input.system } : {}),
      messages: [{ role: 'user', content: input.content }],
    },
    doFetch,
  )) as { content?: { type: string; text?: string }[] };
  return (
    (json.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('\n')
      .trim() || null
  );
}

async function callOpenAIProvider(model: string, input: AiCallInput, doFetch: typeof fetch): Promise<string | null> {
  const key = process.env['OPENAI_API_KEY'] ?? '';
  if (!key) throw new Error('OPENAI_API_KEY ausente');
  // Converte os blocos para o formato do Chat Completions (texto + image_url data-URI).
  const userContent = input.content.map((b) =>
    b.type === 'text'
      ? { type: 'text', text: b.text }
      : { type: 'image_url', image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } },
  );
  const messages = [
    ...(input.system ? [{ role: 'system', content: input.system }] : []),
    { role: 'user', content: userContent },
  ];
  const json = (await postJson(
    OPENAI_URL,
    { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    { model, max_tokens: input.maxTokens ?? 1024, messages },
    doFetch,
  )) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content?.trim() || null;
}

/**
 * Chama o LLM do provedor escolhido e devolve o texto (ou null em falha/timeout).
 * SEMPRE audita `ai_call` (com provedor + modelo). Nunca lança.
 */
export async function callLLM(input: AiCallInput, deps: AiDeps = {}): Promise<string | null> {
  const doFetch = deps.fetchFn ?? fetch;
  const audit = deps.audit ?? defaultAudit;
  const now = deps.now ?? Date.now;
  const provider = getAiProvider();
  const model = getAiModel();
  const t0 = now();

  let ok = false;
  let text: string | null = null;
  let errMsg: string | undefined;
  try {
    text =
      provider === 'openai'
        ? await callOpenAIProvider(model, input, doFetch)
        : await callAnthropicProvider(model, input, doFetch);
    ok = true;
  } catch (e) {
    errMsg = e instanceof Error ? e.message : String(e);
  }

  await audit(input.reportId, {
    purpose: input.purpose,
    provider,
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
