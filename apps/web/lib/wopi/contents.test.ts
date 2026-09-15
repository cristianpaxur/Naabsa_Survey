import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../../app/api/wopi/files/[id]/contents/route';
import type { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({ report: {} as Record<string, unknown>, objects: new Map<string, Buffer>(),
  afterUpload: undefined as (() => void) | undefined, dbError: false }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/wopi/host', () => ({
  BUCKET: 'reports', canPutFile: (r: { status: string }) => r.status === 'editing', currentLock: () => 'lock',
  authWopi: async () => ({ ok: true, claims: { canWrite: true }, report: { ...state.report }, svc: {
    storage: { from: () => ({ upload: async (path: string, bytes: Buffer, options: { upsert: boolean }) => {
      expect(options.upsert).toBe(false); state.objects.set(path, bytes); state.afterUpload?.(); return { error: null };
    } }) },
    from: () => ({ update: (patch: Record<string, unknown>) => {
      const filters: [string, unknown][] = [];
      const query = {
        eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
        then: (resolve: (value: unknown) => unknown) => {
          if (state.dbError) return Promise.resolve(resolve({ error: { message: 'offline' }, count: null }));
          const matches = filters.every(([key, value]) => state.report[key] === value);
          if (matches) Object.assign(state.report, patch);
          return Promise.resolve(resolve({ error: null, count: matches ? 1 : 0 }));
        },
      }; return query;
    } }),
  } }),
}));
function request(): NextRequest {
  return new Request('https://app.test/wopi', { method: 'POST', headers: { 'x-wopi-lock': 'lock' }, body: 'LAST MANUAL EDIT' }) as NextRequest;
}
beforeEach(() => {
  state.report = { id: 'r1', status: 'editing', working_docx_path: 'r1/working/original.docx', working_docx_revision: 5 };
  state.objects.clear(); state.objects.set('r1/working/original.docx', Buffer.from('ORIGINAL'));
  state.afterUpload = undefined; state.dbError = false;
});
describe('WOPI PutFile publica somente após CAS confirmado', () => {
  it('novo save publica versão e conserva bytes da anterior', async () => {
    const response = await POST(request(), { params: Promise.resolve({ id: 'r1' }) });
    expect(response.status).toBe(200); expect(response.headers.get('X-WOPI-ItemVersion')).toBe('6');
    const payload = await response.json() as { LastModifiedTime?: string };
    expect(payload.LastModifiedTime).toBe(state.report.working_docx_saved_at);
    expect(Number.isNaN(Date.parse(payload.LastModifiedTime ?? ''))).toBe(false);
    expect(state.objects.get(state.report.working_docx_path as string)?.toString()).toBe('LAST MANUAL EDIT');
    expect(state.objects.get('r1/working/original.docx')?.toString()).toBe('ORIGINAL');
  });
  it('aprovação durante upload congela a versão anterior e rejeita save tardio', async () => {
    state.afterUpload = () => { state.report.status = 'approved'; };
    const response = await POST(request(), { params: Promise.resolve({ id: 'r1' }) });
    expect(response.status).toBe(409);
    expect(state.report.working_docx_path).toBe('r1/working/original.docx');
    expect(state.objects.get('r1/working/original.docx')?.toString()).toBe('ORIGINAL');
  });
  it('save simultâneo que publicou outra revisão vence sem sobrescrita', async () => {
    state.afterUpload = () => { state.report.working_docx_revision = 6; state.report.working_docx_path = 'other.docx'; };
    expect((await POST(request(), { params: Promise.resolve({ id: 'r1' }) })).status).toBe(409);
    expect(state.report.working_docx_path).toBe('other.docx');
  });
  it('falha banco não retorna sucesso e conserva objeto para commit de resultado ambíguo', async () => {
    state.dbError = true;
    expect((await POST(request(), { params: Promise.resolve({ id: 'r1' }) })).status).toBe(500);
    expect(state.objects.size).toBe(2);
    expect(state.report.working_docx_revision).toBe(5);
  });
});
