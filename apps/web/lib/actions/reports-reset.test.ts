import { beforeEach, describe, expect, it, vi } from 'vitest';

const memory = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  servicePatch: null as Record<string, unknown> | null,
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit', () => ({ audit: vi.fn(async () => {}) }));
vi.mock('@/lib/state-machine', () => ({
  transition: vi.fn(async () => {
    memory.row.status = 'draft';
  }),
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => ({
      update: (value: Record<string, unknown>) => {
        memory.servicePatch = value;
        return { eq: async () => ({ error: null }) };
      },
    }),
    storage: { from: () => ({ remove: async () => ({ error: null }) }) },
  }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        maybeSingle: async () => ({
          data: { status: memory.row.status },
          error: null,
        }),
      };
      return query;
    },
  }),
}));

import { resetToDraft } from './reports';

beforeEach(() => {
  memory.row = { status: 'in_review' };
  memory.servicePatch = null;
});

describe('reinício para reenviar a planilha', () => {
  it('limpa dados derivados, formatos e revisão de IA antigos', async () => {
    expect(await resetToDraft('r1')).toEqual({ ok: true });
    expect(memory.servicePatch).toMatchObject({
      extracted_data: null,
      extraction_issues: null,
      extracted_number_formats: {},
      operator_overrides: null,
      operator_number_formats: {},
      ai_review: null,
      spreadsheet_path: null,
      vessel_name: null,
      working_docx_path: null,
    });
  });
});
