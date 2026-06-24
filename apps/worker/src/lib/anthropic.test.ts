import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { callAnthropic, parseJsonFromText } from './anthropic';

type AuditCall = { reportId: string | null; payload: Record<string, unknown> };
const fakeFetch = (ok: boolean, body: unknown): typeof fetch =>
  (async () =>
    ({ ok, status: ok ? 200 : 500, json: async () => body }) as unknown as Response) as unknown as typeof fetch;

describe('callAnthropic (010/T-006, CA-006 — toda chamada audita ai_call)', () => {
  beforeEach(() => {
    process.env['ANTHROPIC_API_KEY'] = 'test-key';
  });
  afterEach(() => {
    delete process.env['ANTHROPIC_API_KEY'];
  });

  it('sucesso: retorna texto e audita ai_call (ok:true)', async () => {
    const audits: AuditCall[] = [];
    const text = await callAnthropic(
      { purpose: 'ai_review', reportId: 'r1', content: [{ type: 'text', text: 'oi' }] },
      {
        fetchFn: fakeFetch(true, { content: [{ type: 'text', text: 'resposta' }] }),
        audit: async (reportId, payload) => { audits.push({ reportId, payload }); },
        now: () => 1000,
      },
    );
    expect(text).toBe('resposta');
    expect(audits).toHaveLength(1);
    expect(audits[0]!.reportId).toBe('r1');
    expect(audits[0]!.payload['purpose']).toBe('ai_review');
    expect(audits[0]!.payload['ok']).toBe(true);
  });

  it('falha HTTP: retorna null mas AINDA audita ai_call (ok:false)', async () => {
    const audits: AuditCall[] = [];
    const text = await callAnthropic(
      { purpose: 'photo_classify', reportId: null, content: [{ type: 'text', text: 'x' }] },
      { fetchFn: fakeFetch(false, {}), audit: async (reportId, payload) => { audits.push({ reportId, payload }); } },
    );
    expect(text).toBeNull();
    expect(audits).toHaveLength(1);
    expect(audits[0]!.payload['ok']).toBe(false);
    expect(audits[0]!.payload['error']).toBeTruthy();
  });

  it('sem API key: null + audita (nunca lança — RNF-06)', async () => {
    delete process.env['ANTHROPIC_API_KEY'];
    const audits: AuditCall[] = [];
    const text = await callAnthropic(
      { purpose: 'x', reportId: null, content: [] },
      { audit: async (reportId, payload) => { audits.push({ reportId, payload }); } },
    );
    expect(text).toBeNull();
    expect(audits).toHaveLength(1);
    expect(audits[0]!.payload['ok']).toBe(false);
  });
});

describe('parseJsonFromText', () => {
  it('extrai JSON com cerca ```json', () => {
    expect(parseJsonFromText('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it('extrai JSON cru com texto ao redor', () => {
    expect(parseJsonFromText('blá blá {"b":2} fim')).toEqual({ b: 2 });
  });
  it('array também', () => {
    expect(parseJsonFromText('[1,2,3]')).toEqual([1, 2, 3]);
  });
  it('malformado / vazio → null', () => {
    expect(parseJsonFromText('sem json aqui')).toBeNull();
    expect(parseJsonFromText(null)).toBeNull();
  });
});
