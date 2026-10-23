import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  type: 'msc',
  report: {
    id: 'r1',
    status: 'in_review',
    spec_id: 's1',
    working_docx_path: 'original.docx',
    working_docx_revision: 4,
    working_docx_generation: 'g1',
    photo_assignment_revision: 7,
  },
  events: [] as Array<{
    action: string;
    payload: Record<string, unknown>;
    created_at: string;
  }>,
}));
const enqueue = vi.hoisted(() =>
  vi.fn<(payload: unknown, options?: unknown) => Promise<string>>(
    async () => 'job-1',
  ),
);
const transition = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/lib/queue', () => ({
  enqueueBuildWorkingDocx: enqueue,
  enqueueProcessPhoto: vi.fn(),
}));
vi.mock('@/lib/state-machine', () => ({ transition }));
vi.mock('@/lib/audit', () => ({
  audit: async (
    _s: unknown,
    event: { action: string; payload: Record<string, unknown> },
  ) => {
    state.events.unshift({ ...event, created_at: new Date().toISOString() });
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        not: () => query,
        in: () => query,
        order: () => query,
        maybeSingle: async () => ({
          data:
            table === 'reports'
              ? state.report
              : {
                  spec: {
                    report_type: state.type,
                    photo_slots: [{ id: 'vessel', label: 'Vessel' }],
                  },
                },
        }),
        limit: async () => ({ data: state.events.slice(0, 10), error: null }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(
            resolve({
              data: [
                {
                  id: 'p1',
                  slot_id: 'vessel',
                  position: 0,
                  crop: null,
                  status: 'done',
                  processed_path: 'p1.jpg',
                  ai_suggested: false,
                },
              ],
              error: null,
            }),
          ),
      };
      return query;
    },
  }),
}));
import { advance } from './photos';
beforeEach(() => {
  vi.clearAllMocks();
  state.type = 'msc';
  state.events = [];
  state.report.status = 'in_review';
  state.report.working_docx_path = 'original.docx';
  state.report.working_docx_revision = 4;
});
describe('returning from photo allocation to an existing MSC Word', () => {
  it('também sincroniza o BQS antes de reabrir o Word existente', async () => {
    state.type = 'bqs';
    expect(await advance('r1', true)).toEqual({ pending: true });
    expect(enqueue).toHaveBeenCalledOnce();
    expect(transition).not.toHaveBeenCalled();
  });
  it('waits for photo synchronization and deduplicates polling', async () => {
    expect(await advance('r1', true)).toEqual({ pending: true });
    expect(await advance('r1')).toEqual({ pending: true });
    expect(enqueue).toHaveBeenCalledOnce();
    expect(transition).not.toHaveBeenCalled();
    expect(enqueue.mock.calls[0]![0]).toMatchObject({
      refreshPhotos: { path: 'original.docx', revision: 4, photoRevision: 7 },
    });
  });
  it('opens editing only for the version that contains the current photo assignments', async () => {
    await advance('r1', true);
    const payload = state.events[0]!.payload;
    state.report.working_docx_path = 'updated.docx';
    state.report.working_docx_revision = 5;
    state.events.unshift({
      action: 'photos_docx_synced',
      payload: { ...payload, path: 'updated.docx' },
      created_at: new Date().toISOString(),
    });
    // A retry of the old job can fail after another job already published.
    // Its failure must not hide the successful current Word version.
    state.events.unshift({
      action: 'photos_docx_sync_failed',
      payload: { ...payload, message: 'Old job lost its revision' },
      created_at: new Date().toISOString(),
    });
    expect(await advance('r1')).toEqual({ ok: true });
    expect(transition).toHaveBeenCalledOnce();
    expect(transition).toHaveBeenCalledWith(
      expect.anything(),
      'r1',
      'in_review',
      'editing',
      'u1',
      { expectedPhotoRevision: 7 },
    );
  });
  it('reports a failed synchronization and allows an explicit retry without queue deduplication', async () => {
    await advance('r1', true);
    state.events.unshift({
      action: 'photos_docx_sync_failed',
      payload: { ...state.events[0]!.payload, message: 'Conversion failed' },
      created_at: new Date().toISOString(),
    });
    expect(await advance('r1')).toEqual({ error: 'Conversion failed' });
    expect(await advance('r1', true)).toEqual({ pending: true });
    expect(enqueue).toHaveBeenLastCalledWith(expect.anything(), {
      dedupe: false,
    });
  });
});
