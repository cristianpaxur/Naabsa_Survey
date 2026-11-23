import { beforeEach, describe, expect, it, vi } from 'vitest';

const memory = vi.hoisted(() => ({
  user: true,
  row: null as null | Record<string, unknown>,
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit', () => ({ audit: vi.fn(async () => {}) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({}) }));
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
        update(value: Record<string, unknown>) {
          patch = value;
          return query;
        },
        select() {
          return query;
        },
        eq(key: string, value: unknown) {
          filters.push((row) => row[key] === value);
          return query;
        },
        is(key: string, value: unknown) {
          filters.push((row) => row[key] === value);
          return query;
        },
        not(key: string, operator: string, value: unknown) {
          if (operator === 'is') filters.push((row) => row[key] !== value);
          return query;
        },
        async maybeSingle() {
          if (!memory.row || !filters.every((filter) => filter(memory.row!)))
            return { data: null, error: null };
          if (patch) Object.assign(memory.row, patch);
          return { data: { ...memory.row }, error: null };
        },
      };
      return query;
    },
  }),
}));

import { restoreReport, trashReport } from './reports';

beforeEach(() => {
  memory.user = true;
  memory.row = {
    id: 'r1',
    status: 'editing',
    deleted_at: null,
    deleted_by: null,
    wopi_lock: 'lock',
  };
});

describe('lixeira de relatórios', () => {
  it('move para a lixeira sem apagar nem alterar o status do relatório', async () => {
    expect(await trashReport('r1')).toEqual({ ok: true });
    expect(memory.row?.deleted_at).toEqual(expect.any(String));
    expect(memory.row?.deleted_by).toBe('u1');
    expect(memory.row?.status).toBe('editing');
    expect(memory.row?.wopi_lock).toBeNull();
  });

  it('restaura o mesmo relatório e rejeita operações repetidas', async () => {
    expect(await trashReport('r1')).toEqual({ ok: true });
    expect(await trashReport('r1')).toHaveProperty('error');
    expect(await restoreReport('r1')).toEqual({ ok: true });
    expect(memory.row?.deleted_at).toBeNull();
    expect(memory.row?.deleted_by).toBeNull();
    expect(await restoreReport('r1')).toHaveProperty('error');
  });

  it('não altera dados sem uma sessão autenticada', async () => {
    memory.user = false;
    expect(await trashReport('r1')).toEqual({ error: 'Sessão expirada.' });
    expect(memory.row?.deleted_at).toBeNull();
  });
});
