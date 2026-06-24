import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { callLLM, parseJsonFromText, getAiProvider, getAiModel } from './llm';

type AuditCall = { reportId: string | null; payload: Record<string, unknown> };
const fakeFetch = (ok: boolean, body: unknown): typeof fetch =>
  (async () =>
    ({ ok, status: ok ? 200 : 500, json: async () => body }) as unknown as Response) as unknown as typeof fetch;

function clearEnv() {
  delete process.env['AI_PROVIDER'];
  delete process.env['AI_MODEL'];
  delete process.env['ANTHROPIC_MODEL'];
  delete process.env['ANTHROPIC_API_KEY'];
  delete process.env['OPENAI_API_KEY'];
}

describe('callLLM — multi-provedor (010/T-006, CA-006)', () => {
  beforeEach(clearEnv);
  afterEach(clearEnv);

  it('anthropic (default): parseia content[] e audita ai_call com provider=anthropic', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'k';
    const audits: AuditCall[] = [];
    const text = await callLLM(
      { purpose: 'ai_review', reportId: 'r1', content: [{ type: 'text', text: 'oi' }] },
      {
        fetchFn: fakeFetch(true, { content: [{ type: 'text', text: 'resp-anthropic' }] }),
        audit: async (reportId, payload) => { audits.push({ reportId, payload }); },
        now: () => 0,
      },
    );
    expect(text).toBe('resp-anthropic');
    expect(audits[0]!.payload['provider']).toBe('anthropic');
    expect(audits[0]!.payload['ok']).toBe(true);
  });

  it('openai: parseia choices[] e audita ai_call com provider=openai', async () => {
    process.env['AI_PROVIDER'] = 'openai';
    process.env['OPENAI_API_KEY'] = 'k';
    const audits: AuditCall[] = [];
    const text = await callLLM(
      { purpose: 'photo_classify', reportId: 'r2', content: [{ type: 'text', text: 'oi' }] },
      {
        fetchFn: fakeFetch(true, { choices: [{ message: { content: 'resp-openai' } }] }),
        audit: async (reportId, payload) => { audits.push({ reportId, payload }); },
      },
    );
    expect(text).toBe('resp-openai');
    expect(audits[0]!.payload['provider']).toBe('openai');
  });

  it('falha HTTP: null mas AINDA audita ai_call (ok:false)', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'k';
    const audits: AuditCall[] = [];
    const text = await callLLM(
      { purpose: 'ai_review', reportId: null, content: [] },
      { fetchFn: fakeFetch(false, {}), audit: async (reportId, payload) => { audits.push({ reportId, payload }); } },
    );
    expect(text).toBeNull();
    expect(audits[0]!.payload['ok']).toBe(false);
    expect(audits[0]!.payload['error']).toBeTruthy();
  });

  it('sem API key do provedor: null + audita (nunca lança — RNF-06)', async () => {
    process.env['AI_PROVIDER'] = 'openai'; // sem OPENAI_API_KEY
    const audits: AuditCall[] = [];
    const text = await callLLM(
      { purpose: 'x', reportId: null, content: [] },
      { audit: async (reportId, payload) => { audits.push({ reportId, payload }); } },
    );
    expect(text).toBeNull();
    expect(audits[0]!.payload['ok']).toBe(false);
  });
});

describe('getAiProvider / getAiModel', () => {
  beforeEach(clearEnv);
  afterEach(clearEnv);

  it('default anthropic + modelo default', () => {
    expect(getAiProvider()).toBe('anthropic');
    expect(getAiModel()).toBe('claude-sonnet-4-6');
  });
  it('openai → modelo default gpt-4o; AI_MODEL sobrepõe', () => {
    process.env['AI_PROVIDER'] = 'openai';
    expect(getAiProvider()).toBe('openai');
    expect(getAiModel()).toBe('gpt-4o');
    process.env['AI_MODEL'] = 'gpt-4.1';
    expect(getAiModel()).toBe('gpt-4.1');
  });
});

describe('parseJsonFromText', () => {
  it('cerca ```json / cru com texto ao redor / array / malformado', () => {
    expect(parseJsonFromText('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonFromText('blá {"b":2} fim')).toEqual({ b: 2 });
    expect(parseJsonFromText('[1,2]')).toEqual([1, 2]);
    expect(parseJsonFromText('nada')).toBeNull();
    expect(parseJsonFromText(null)).toBeNull();
  });
});
