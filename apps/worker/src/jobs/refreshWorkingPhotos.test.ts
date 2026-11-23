import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { serializePhotoAssignments } from '@naabsa/core';
const state = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  events: [] as Array<{ action: string }>,
  photos: [
    {
      id: 'p1',
      slot_id: 'vessel',
      position: 0,
      crop: null,
      processed_path: 'p1.jpg',
      status: 'done',
      ai_suggested: false,
    },
  ],
  objects: new Map<string, Buffer>(),
}));
const assemble = vi.hoisted(() => vi.fn());
const measuredPages = vi.hoisted(() => ({
  msc_cover_contacts_end: 1,
  s1: 3,
  s5: 5,
  s6: 6,
}));
const replace = vi.hoisted(() =>
  vi.fn(() => Buffer.from('PHOTOS + ORIGINAL TEXT')),
);
vi.mock('./generatePdf', () => ({
  loadReport: async () => ({ ...state.row }),
  buildWorkingDocx: (...args: unknown[]) => assemble(...args),
}));
vi.mock('../lib/buildDocxMsc', () => ({
  replaceMscPhotoSections: (...args: unknown[]) => replace(...(args as [])),
  updateMscTocPages: (docx: Buffer) => docx,
}));
vi.mock('../lib/mscPagination', () => ({
  fitMscCoverContacts: async (docx: Buffer) => ({
    docx,
    pages: { msc_cover_contacts_end: 1, s1: 3, s5: 5, s6: 6 },
  }),
  measureMscPages: async () => ({ ...measuredPages }),
}));
vi.mock('../lib/supabase', () => ({
  getServiceClient: () => ({
    storage: {
      from: () => ({
        download: async (path: string) => ({
          data: new Blob([state.objects.get(path)!]),
          error: null,
        }),
        upload: async (path: string, bytes: Buffer) => {
          state.objects.set(path, bytes);
          return { error: null };
        },
      }),
    },
    from: (table: string) => {
      let patch: Record<string, unknown> | undefined;
      const filters: Array<[string, unknown]> = [];
      const query = {
        select: () => query,
        eq: (k: string, v: unknown) => {
          filters.push([k, v]);
          return query;
        },
        is: (k: string, v: unknown) => {
          filters.push([k, v]);
          return query;
        },
        not: () => query,
        update: (value: Record<string, unknown>) => {
          patch = value;
          return query;
        },
        insert: async (event: { action: string }) => {
          state.events.push(event);
          return { error: null };
        },
        then: (resolve: (value: unknown) => unknown) => {
          if (table === 'report_photos')
            return Promise.resolve(
              resolve({ data: state.photos, error: null }),
            );
          const match = filters.every(([k, v]) => state.row[k] === v);
          if (match && patch) Object.assign(state.row, patch);
          return Promise.resolve(
            resolve({ error: null, count: match ? 1 : 0 }),
          );
        },
      };
      return query;
    },
  }),
}));
import { buildWorkingDocx } from './buildWorkingDocx';
const payload = () => ({
  reportId: 'r1',
  generation: 'g1',
  refreshPhotos: {
    path: 'original.docx',
    revision: 4,
    photoRevision: 7,
    assignmentKey: createHash('sha256')
      .update(serializePhotoAssignments(state.photos))
      .digest('hex'),
  },
});
beforeEach(() => {
  vi.clearAllMocks();
  measuredPages.msc_cover_contacts_end = 1;
  state.events = [];
  state.objects.clear();
  state.objects.set('original.docx', Buffer.from('ORIGINAL TEXT'));
  state.row = {
    id: 'r1',
    type_slug: 'msc',
    status: 'in_review',
    working_docx_generation: 'g1',
    working_docx_path: 'original.docx',
    working_docx_revision: 4,
    photo_assignment_revision: 7,
    wopi_lock: null,
  };
  assemble.mockResolvedValue({ docx: Buffer.from('FRESH PHOTOS') });
});
describe('MSC photo refresh with optimistic publication', () => {
  it('retains the saved Word when the final TOC pass moves cover contacts to page 2', async () => {
    measuredPages.msc_cover_contacts_end = 2;
    await expect(buildWorkingDocx(payload())).rejects.toThrow(
      'permanecer na capa',
    );
    expect(state.row.working_docx_path).toBe('original.docx');
    expect(state.row.working_docx_revision).toBe(4);
    expect(state.objects.size).toBe(1);
    expect(state.events.at(-1)?.action).toBe('photos_docx_sync_failed');
  });
  it('publishes an immutable version and retains the original document and stage', async () => {
    await buildWorkingDocx(payload());
    expect(state.objects.get('original.docx')?.toString()).toBe(
      'ORIGINAL TEXT',
    );
    expect(replace).toHaveBeenCalledWith(
      Buffer.from('ORIGINAL TEXT'),
      Buffer.from('FRESH PHOTOS'),
    );
    expect(state.row.working_docx_revision).toBe(5);
    expect(state.row.status).toBe('in_review');
    expect(state.events.at(-1)?.action).toBe('photos_docx_synced');
  });
  it.each(['document', 'photos', 'session'])(
    'does not replace a concurrent %s change',
    async (change) => {
      assemble.mockImplementation(async () => {
        if (change === 'document') state.row.working_docx_revision = 5;
        if (change === 'photos') state.row.photo_assignment_revision = 8;
        if (change === 'session') state.row.wopi_lock = 'live';
        return { docx: Buffer.from('FRESH') };
      });
      await expect(buildWorkingDocx(payload())).rejects.toThrow(
        'documento mudou',
      );
      expect(state.row.working_docx_path).toBe('original.docx');
      expect(state.events.at(-1)?.action).toBe('photos_docx_sync_failed');
    },
  );
  it.each(['approved', 'generated'])(
    'leaves a %s document intact',
    async (status) => {
      state.row.status = status;
      await buildWorkingDocx(payload());
      expect(assemble).not.toHaveBeenCalled();
    },
  );
});
