import { beforeEach, describe, expect, it, vi } from 'vitest';

const memory = vi.hoisted(() => ({
  user: true,
  row: {
    id: 'r1',
    status: 'editing',
    deleted_at: null,
    wopi_lock: 'lock-1',
    wopi_lock_expires_at: '2099-01-01T00:00:00.000Z',
  } as Record<string, unknown>,
}));

vi.mock('@/lib/audit', () => ({ audit: vi.fn(async () => {}) }));
vi.mock('@/lib/queue', () => ({ enqueueProcessPhoto: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: memory.user ? { id: 'u1' } : null },
      }),
    },
    from: () => {
      const filters: Array<(row: Record<string, unknown>) => boolean> = [];
      let patch: Record<string, unknown> | null = null;
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => {
          filters.push((row) => row[key] === value);
          return query;
        },
        is: (key: string, value: unknown) => {
          filters.push((row) => row[key] === value);
          return query;
        },
        update: (value: Record<string, unknown>) => {
          patch = value;
          return query;
        },
        maybeSingle: async () => {
          if (!filters.every((filter) => filter(memory.row)))
            return { data: null, error: null };
          if (patch) Object.assign(memory.row, patch);
          return { data: { ...memory.row }, error: null };
        },
        then: (resolve: (value: unknown) => unknown) => {
          const matches = filters.every((filter) => filter(memory.row));
          if (matches && patch) Object.assign(memory.row, patch);
          return Promise.resolve(
            resolve({ error: null, count: matches ? 1 : 0 }),
          );
        },
      };
      return query;
    },
  }),
}));

import { returnToPhotos } from './photos';

beforeEach(() => {
  memory.user = true;
  memory.row = {
    id: 'r1',
    status: 'editing',
    deleted_at: null,
    wopi_lock: 'lock-1',
    wopi_lock_expires_at: '2099-01-01T00:00:00.000Z',
  };
});

describe('retorno para a etapa de fotos', () => {
  it('volta editing → in_review sem remover dados do relatório', async () => {
    expect(await returnToPhotos('r1')).toEqual({ ok: true });
    expect(memory.row.status).toBe('in_review');
    expect(memory.row).toMatchObject({
      wopi_lock: null,
      wopi_lock_expires_at: null,
    });
  });

  it('não altera um relatório que já não está em edição', async () => {
    memory.row.status = 'in_review';
    expect(await returnToPhotos('r1')).toHaveProperty('error');
    expect(memory.row.status).toBe('in_review');
  });
});
