import { describe, expect, it, vi } from 'vitest';
vi.mock('./audit', () => ({ audit: vi.fn(async () => {}) }));
import { transition } from './state-machine';

describe('photo revision when entering editing', () => {
  it('rejects photos changed after the document synchronization was checked', async () => {
    const row: Record<string, unknown> = {
      id: 'r1',
      status: 'in_review',
      deleted_at: null,
      photo_assignment_revision: 8,
    };
    const filters: Array<[string, unknown]> = [];
    let patch: Record<string, unknown> = {};
    const query = {
      update: (value: Record<string, unknown>) => {
        patch = value;
        return query;
      },
      eq: (key: string, value: unknown) => {
        filters.push([key, value]);
        return query;
      },
      is: (key: string, value: unknown) => {
        filters.push([key, value]);
        return query;
      },
      then: (resolve: (value: unknown) => unknown) => {
        const matches = filters.every(([key, value]) => row[key] === value);
        if (matches) Object.assign(row, patch);
        return Promise.resolve(
          resolve({ error: null, count: matches ? 1 : 0 }),
        );
      },
    };
    const client = { from: () => query };
    await expect(
      transition(client as never, 'r1', 'in_review', 'editing', 'u1', {
        expectedPhotoRevision: 7,
      }),
    ).rejects.toThrow('transição abortada');
    expect(row.status).toBe('in_review');
  });
});
