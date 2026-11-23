import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { runExtraction, type ReportSpec } from '@naabsa/core';
import { buildWorkingDocx, type ReportRow } from './generatePdf';
const build = vi.hoisted(() => vi.fn(async () => Buffer.from('BQS')));
vi.mock('../lib/bqsDocument', () => ({ buildPaginatedDocxBqs: build }));
const spreadsheet = readFileSync(
  new URL(
    '../../../../tests/fixtures/planilhas/bqs/synthetic.xlsx',
    import.meta.url,
  ),
);
const spec = JSON.parse(
  readFileSync(
    new URL('../../../../tests/fixtures/specs/bqs.v1.json', import.meta.url),
    'utf8',
  ),
) as ReportSpec;
let row: ReportRow;
beforeAll(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(spreadsheet as never);
  row = {
    status: 'editing',
    working_docx_path: null,
    working_docx_revision: 0,
    working_docx_generation: 'g1',
    approved_docx_path: null,
    approved_docx_revision: null,
    variant: null,
    spec_id: 's1',
    extracted_data: runExtraction(wb, spec).data,
    operator_overrides: { vessel_close_start: '19:10' },
    spreadsheet_path: 'original.xlsx',
    created_by: null,
    pdf_paths: [],
    type_slug: 'bqs',
  };
});
function service(photos: unknown[] = [], failedPhoto = false) {
  return {
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        is: () => q,
        not: () => q,
        single: async () => ({ data: { spec }, error: null }),
        order: async () => ({ data: photos, error: null }),
      };
      return q;
    },
    storage: {
      from: () => ({
        download: async (path: string) =>
          path === 'original.xlsx'
            ? { data: { arrayBuffer: async () => spreadsheet }, error: null }
            : failedPhoto
              ? { data: null, error: { message: 'download failed' } }
              : { data: null, error: null },
      }),
    },
  };
}
describe('BQS — despacho explícito e integridade de fotos', () => {
  it('usa builder BQS, quatro tabelas e o override confirmado', async () => {
    const out = await buildWorkingDocx(service() as never, 'r1', row);
    expect(out.docx.toString()).toBe('BQS');
    expect(out.variant).toBeNull();
    expect(build).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ vessel_close_start: '19:10' }),
        tables: expect.objectContaining({ barge_open: expect.any(Array) }),
      }),
    );
  });
  it('interrompe quando foto alocada não pode ser baixada', async () => {
    await expect(
      buildWorkingDocx(
        service(
          [
            {
              slot_id: 'cover',
              processed_path: 'photo.png',
              status: 'done',
              ai_suggested: false,
              crop: null,
            },
          ],
          true,
        ) as never,
        'r1',
        row,
      ),
    ).rejects.toThrow(/foto/);
  });
  it('interrompe se a planilha ou um cálculo obrigatório não estiver disponível', async () => {
    await expect(
      buildWorkingDocx(service() as never, 'r1', {
        ...row,
        spreadsheet_path: null,
      }),
    ).rejects.toThrow(/planilha/);
    await expect(
      buildWorkingDocx(service() as never, 'r1', {
        ...row,
        operator_overrides: { vessel_close_start: '19:10', vessel_received: 0 },
      }),
    ).rejects.toThrow(/inconsistente/);
  });
});
