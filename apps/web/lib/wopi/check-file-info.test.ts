import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { GET } from '../../app/api/wopi/files/[id]/route';

const state = vi.hoisted(() => ({
  report: {} as Record<string, unknown>,
  storageUpdatedAt: '2026-09-16T01:59:53.423Z',
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/wopi/host', () => ({
  BUCKET: 'reports',
  LOCK_TTL_MS: 30 * 60 * 1000,
  currentLock: () => null,
  lockDecision: () => ({ status: 200 }),
  authWopi: async () => ({
    ok: true,
    claims: { userId: 'u1', canWrite: true },
    report: { ...state.report },
    svc: {
      storage: {
        from: () => ({
          list: async () => ({
            data: [{
              name: 'saved.docx',
              updated_at: state.storageUpdatedAt,
              metadata: { size: 123 },
            }],
            error: null,
          }),
        }),
      },
    },
  }),
}));

beforeEach(() => {
  vi.stubEnv('WOPI_PUBLIC_URL', 'https://surveyors.test');
  state.report = {
    id: 'r1',
    status: 'editing',
    vessel_name: 'MAHA ROOS',
    working_docx_path: 'r1/working/saved.docx',
    working_docx_revision: 7,
    working_docx_saved_at: '2026-09-16T01:59:51.821Z',
  };
});

describe('WOPI CheckFileInfo mantém a versão temporal do PutFile', () => {
  it('usa o timestamp persistido do documento, não o horário divergente do Storage', async () => {
    const response = await GET(
      new Request('https://app.test/wopi') as NextRequest,
      { params: Promise.resolve({ id: 'r1' }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      Version: '7',
      LastModifiedTime: '2026-09-16T01:59:51.821Z',
    });
  });

  it('usa o timestamp do Storage somente para documentos antigos sem valor persistido', async () => {
    state.report.working_docx_saved_at = null;
    const response = await GET(
      new Request('https://app.test/wopi') as NextRequest,
      { params: Promise.resolve({ id: 'r1' }) },
    );

    await expect(response.json()).resolves.toMatchObject({
      LastModifiedTime: state.storageUpdatedAt,
    });
  });
});
