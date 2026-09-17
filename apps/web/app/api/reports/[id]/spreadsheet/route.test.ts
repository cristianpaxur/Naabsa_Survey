import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import type { NextRequest } from 'next/server';
import type { ReportSpec } from '@naabsa/core';

const state = vi.hoisted(() => ({
  update: null as Record<string, unknown> | null,
  uploads: [] as Array<{
    bucket: string;
    path: string;
    body: Buffer;
    options: { upsert: boolean; contentType: string };
  }>,
  audits: [] as Array<{
    reportId: string | null;
    actor: string | null;
    action: string;
    payload?: unknown;
  }>,
  spec: null as ReportSpec | null,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: 'user-1',
            aud: 'authenticated',
            role: 'authenticated',
            email: 'surveyor@naabsa.test',
            app_metadata: {},
            user_metadata: {},
            created_at: '2026-09-17T12:00:00.000Z',
          },
        },
        error: null,
      }),
    },
    from: (table: string) => {
      let operation: 'select' | 'update' = 'select';
      let update: Record<string, unknown> | null = null;
      const filters: Array<[string, unknown]> = [];
      const query = {
        select: () => query,
        update: (payload: Record<string, unknown>) => {
          operation = 'update';
          update = payload;
          return query;
        },
        eq: (column: string, value: unknown) => {
          filters.push([column, value]);
          return query;
        },
        is: (column: string, value: unknown) => {
          filters.push([column, value]);
          return query;
        },
        maybeSingle: async () => ({
          data:
            table === 'reports' &&
            filters.some(
              ([column, value]) => column === 'id' && value === 'report-1',
            )
              ? {
                  id: 'report-1',
                  status: 'draft',
                  variant: null,
                  spec_id: 'spec-1',
                  deleted_at: null,
                }
              : null,
          error: null,
          count: null,
          status: 200,
          statusText: 'OK',
        }),
        single: async () => ({
          data:
            table === 'report_specs'
              ? {
                  id: 'spec-1',
                  spec: state.spec,
                  created_at: '2026-09-17T12:00:00.000Z',
                }
              : null,
          error: null,
          count: null,
          status: 200,
          statusText: 'OK',
        }),
        then: <TResult1 = unknown, TResult2 = never>(
          onfulfilled?:
            | ((value: unknown) => TResult1 | PromiseLike<TResult1>)
            | null,
          onrejected?:
            | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
            | null,
        ) => {
          if (operation === 'update' && table === 'reports')
            state.update = update;
          return Promise.resolve({
            data: null,
            error: null,
            count: 1,
            status: 204,
            statusText: 'No Content',
          }).then(onfulfilled, onrejected);
        },
      };
      return query;
    },
  }),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    storage: {
      createBucket: async (name: string, options: { public: boolean }) => ({
        data: { name, public: options.public },
        error: null,
      }),
      from: (bucket: string) => ({
        upload: async (
          path: string,
          body: Buffer,
          options: { upsert: boolean; contentType: string },
        ) => {
          state.uploads.push({ bucket, path, body, options });
          return {
            data: { id: 'object-1', path, fullPath: `${bucket}/${path}` },
            error: null,
          };
        },
      }),
    },
  }),
}));

vi.mock('@/lib/audit', () => ({
  audit: async (
    _client: unknown,
    entry: {
      reportId: string | null;
      actor: string | null;
      action: string;
      payload?: unknown;
    },
  ) => {
    state.audits.push(entry);
  },
}));
vi.mock('@/lib/state-machine', () => ({
  transition: vi.fn(async () => undefined),
}));
vi.mock('@/lib/queue', () => ({
  enqueueRenderSheets: vi.fn(async () => 'render-job-1'),
}));
vi.mock('@/lib/request-ai-review', () => ({
  requestAiReview: vi.fn(async () => undefined),
}));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: () => ({ ok: true, retryAfterSec: 0 }),
}));

import { POST } from './route';

beforeEach(() => {
  state.update = null;
  state.uploads = [];
  state.audits = [];
  state.spec = Object.freeze({
    report_type: 'precision',
    version: 1,
    variants: [],
    source: {
      sheet: 'DADOS',
      fingerprint: { cell: 'A1', expect: 'PRECISION' },
      common: {
        fields: {
          summer_dwt: {
            cell: 'B2',
            type: 'number',
            label: 'Summer DWT',
            section: 'Particulars',
          },
        },
      },
    },
  } satisfies ReportSpec);
});

describe('POST /api/reports/[id]/spreadsheet', () => {
  it('persiste a precisão exibida no Excel junto com os dados extraídos', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('DADOS');
    sheet.getCell('A1').value = 'PRECISION';
    sheet.getCell('B2').value = 81;
    sheet.getCell('B2').numFmt = '0.00';

    const xlsx = await workbook.xlsx.writeBuffer();
    const form = new FormData();
    form.set(
      'file',
      new File([xlsx as BlobPart], 'precision.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    );
    const request = new Request(
      'http://localhost/api/reports/report-1/spreadsheet',
      {
        method: 'POST',
        body: form,
      },
    );

    const response = await POST(request as NextRequest, {
      params: Promise.resolve({ id: 'report-1' }),
    });

    expect(response.status).toBe(200);
    expect(state.update).toMatchObject({
      extracted_data: expect.objectContaining({ summer_dwt: 81 }),
      extracted_number_formats: expect.objectContaining({ summer_dwt: 2 }),
    });
    expect(
      state.audits.find(({ action }) => action === 'extraction'),
    ).toMatchObject({
      payload: expect.objectContaining({ formattedFields: 1 }),
    });
  });
});
