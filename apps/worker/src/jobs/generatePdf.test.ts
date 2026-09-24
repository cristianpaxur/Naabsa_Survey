import { createHash } from 'crypto';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import PizZip from 'pizzip';
import { readFileSync } from 'node:fs';
import {
  buildWorkingDocx,
  loadReport,
  convertWorkingDocxToPdf,
  missingRequiredSheetPhases,
  nextPdfVersion,
} from './generatePdf';

const convertDocxMock = vi.hoisted(() => vi.fn());
vi.mock('../lib/soffice', () => ({
  convertDocxToPdf: convertDocxMock,
  measureBookmarkPages: vi.fn(async () => ({})),
}));
vi.mock('../lib/documentLayoutQa', () => ({
  validateDocumentLayout: async () => ({ ok: true, pageCount: 1, blankPages: [], aiRequestedSmallerPhotos: false }),
}));

beforeEach(() => {
  convertDocxMock.mockReset();
  convertDocxMock.mockResolvedValue(Buffer.from('PDF'));
});

describe('precisão efetiva na montagem usada por working DOCX e PDF', () => {
  it('recupera Delivered e horários ausentes da planilha de um relatório já extraído', async () => {
    const spreadsheet = readFileSync(new URL('../../../../tests/fixtures/planilhas/draft_survey/draft_survey.real.v1.xlsx', import.meta.url));
    const spec = JSON.parse(readFileSync(new URL('../../../../tests/fixtures/specs/draft_survey.v1.json', import.meta.url), 'utf8'));
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lW8UqAAAAABJRU5ErkJggg==', 'base64');
    const stored = {
      status: 'editing', working_docx_path: null, working_docx_revision: 0,
      working_docx_generation: 'g1', approved_docx_path: null, approved_docx_revision: null,
      variant: 'loading', spec_id: 's1',
      extracted_data: { port: 'PARANAGUA,BRAZIL', delivered: null, initial_date: '2026-02-08',
        initial_start: null, initial_end: '10:00', final_date: '2026-05-30',
        final_start: null, final_end: '16:00' },
      operator_overrides: { initial_end: '10:20' },
      extracted_number_formats: {}, operator_number_formats: {},
      spreadsheet_path: 'original.xlsx', created_by: null, pdf_paths: [],
      report_types: { slug: 'draft_survey' },
    };
    const svc = {
      from: (table: string) => {
        let columns = '';
        const query = {
          select: (selected: string) => { columns = selected; return query; },
          eq: () => query, is: () => query, not: () => query,
          single: async () => ({ data: table === 'report_specs' ? { spec } :
            Object.fromEntries(Object.entries(stored).filter(([key]) => columns.includes(key))), error: null }),
          order: async () => ({ data: [], error: null }),
        };
        return query;
      },
      storage: { from: () => ({ download: async (path: string) => ({
        data: { arrayBuffer: async () => path === 'original.xlsx' ? spreadsheet : png }, error: null,
      }) }) },
    };
    const row = await loadReport(svc as never, 'r1');
    const built = await buildWorkingDocx(svc as never, 'r1', row!);
    expect(built.data['delivered']).toBe(2023);
    expect(built.data['initial_start']).toBe('07:55');
    expect(built.data['final_start']).toBe('14:30');
    expect(built.data['initial_end']).toBe('10:20');
  });

  it.each(['draft_survey', 'msc'])('carrega e resolve mapas no builder %s', async (slug) => {
    const stored = {
      status: 'editing', working_docx_path: null, working_docx_revision: 0,
      working_docx_generation: 'g1', approved_docx_path: null, approved_docx_revision: null,
      variant: slug === 'msc' ? null : 'loading', spec_id: 's1',
      extracted_data: { summer_dwt: 80, net_tonnage: 12000, loa: 228.9 },
      operator_overrides: { summer_dwt: 81 },
      extracted_number_formats: { summer_dwt: 0, net_tonnage: 0 },
      operator_number_formats: { summer_dwt: 1, net_tonnage: 2 },
      spreadsheet_path: null, created_by: null, pdf_paths: [], report_types: { slug },
    };
    const spec = { report_type: slug, version: 1, source: { sheet: 'Capa',
      common: { fields: {
        summer_dwt: { cell: 'A1', type: 'number', decimals: 3 },
        net_tonnage: { cell: 'A2', type: 'number', decimals: 3 },
        loa: { cell: 'A3', type: 'number', decimals: 3 },
      } }, by_variant: {},
    }, validations: [], photo_slots: [] };
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lW8UqAAAAABJRU5ErkJggg==', 'base64');
    const svc = {
      from: (table: string) => {
        let columns = '';
        const query = {
          select: (selected: string) => { columns = selected; return query; },
          eq: () => query, is: () => query, not: () => query,
          single: async () => ({ data: table === 'report_specs' ? { spec } :
            Object.fromEntries(Object.entries(stored).filter(([key]) => columns.includes(key))), error: null }),
          order: async () => ({ data: [], error: null }),
        };
        return query;
      },
      storage: { from: () => ({ download: async () => ({ data: { arrayBuffer: async () => png }, error: null }) }) },
    };
    const row = await loadReport(svc as never, 'r1');
    expect(row).not.toBeNull();
    const built = await buildWorkingDocx(svc as never, 'r1', row!);
    const xml = new PizZip(built.docx).file('word/document.xml')!.asText();
    const rowText = (label: string) => {
      const entry = (xml.match(/<w:tr\b[^>]*>.*?<\/w:tr>/gs) ?? []).find((row) =>
        [...row.matchAll(/<w:t(?:\s[^>]*)?>(.*?)<\/w:t>/gs)].map((match) => match[1]).join('').toLowerCase().includes(label.toLowerCase()));
      expect(entry).toBeDefined();
      return [...entry!.matchAll(/<w:t(?:\s[^>]*)?>(.*?)<\/w:t>/gs)].map((match) => match[1]).join('');
    };
    if (slug === 'draft_survey') expect(rowText('Summer DWT').match(/81(?:\.\d+)?/g)).toEqual(['81.0']);
    expect(rowText('Net tonnage').match(/12,000(?:\.\d+)?/g)).toEqual(['12,000']);
    expect(rowText('LOA').match(/228(?:\.\d+)?/g)).toEqual(['228.900']);
    expect(built.data).toEqual({ summer_dwt: 81, net_tonnage: 12000, loa: 228.9 });
    if (slug === 'draft_survey') expect(convertDocxMock.mock.calls[0]?.[0]).toEqual(built.docx);
  });
});

describe('nextPdfVersion (010/T-005, CA-003)', () => {
  it('primeira geração → v1', () => {
    expect(nextPdfVersion([])).toBe(1);
  });

  it('acumula a partir da maior versão existente', () => {
    expect(nextPdfVersion(['3ffa/final-v1.pdf'])).toBe(2);
    expect(nextPdfVersion(['3ffa/final-v1.pdf', '3ffa/final-v2.pdf'])).toBe(3);
  });

  it('ignora caminhos legados sem versão (final.pdf antigo)', () => {
    expect(nextPdfVersion(['3ffa/final.pdf'])).toBe(1);
    expect(nextPdfVersion(['3ffa/final.pdf', '3ffa/final-v3.pdf'])).toBe(4);
  });
});

describe('missingRequiredSheetPhases', () => {
  const png = Buffer.from('png');

  it('exige initial e final quando não há fase intermediária', () => {
    expect(missingRequiredSheetPhases(
      { initial: null, intermediate: null, final: png },
      false,
    )).toEqual(['initial']);
  });

  it('exige as três imagens quando há fase intermediária', () => {
    expect(missingRequiredSheetPhases(
      { initial: png, intermediate: null, final: png },
      true,
    )).toEqual(['intermediate']);
  });
});

describe('convertWorkingDocxToPdf (012/T-005..T-007, CA-004)', () => {
  it('converte o working.docx EDITADO (sem reconstruir dos dados) e hash = sha256 do binário', async () => {
    const edited = Buffer.from('DOCX-EDITADO-NO-COLLABORA');
    const svc = {
      storage: {
        from: () => ({
          download: async (path: string) => { expect(path).toBe('r1/working/approved.docx'); return { data: { arrayBuffer: async () => edited }, error: null }; },
        }),
      },
      // Se o job tentar reconstruir dos dados (spec/planilha), o teste falha:
      from: () => {
        throw new Error('não deveria reconstruir dos dados quando working.docx existe');
      },
    };
    const row = {
      status: 'approved',
      approved_docx_path: 'r1/working/approved.docx',
      working_docx_path: 'r1/working/newer-edit.docx',
      variant: null,
      spec_id: 's1',
      extracted_data: {},
      operator_overrides: {},
      extracted_number_formats: { summer_dwt: 0 },
      operator_number_formats: { summer_dwt: 3 },
      spreadsheet_path: null,
      created_by: null,
      pdf_paths: [],
    };

    const out = await convertWorkingDocxToPdf(svc as never, 'r1', row as never);
    expect(out.docx.equals(edited)).toBe(true);
    expect(out.pdf.equals(Buffer.from('PDF'))).toBe(true);
    expect(out.docHash).toBe(createHash('sha256').update(edited).digest('hex'));
  });

  it('traduz falha do conversor em erro útil para a tela de PDF', async () => {
    convertDocxMock.mockRejectedValueOnce(new Error('soffice timeout'));
    const svc = {
      storage: { from: () => ({ download: async () => ({ data: { arrayBuffer: async () => Buffer.from('DOCX') }, error: null }) }) },
    };
    await expect(convertWorkingDocxToPdf(
      svc as never,
      'r1',
      { status: 'approved', approved_docx_path: 'r1/saved.docx' } as never,
    )).rejects.toThrow('Não foi possível converter o documento salvo em PDF');
  });
});

  it('arquivo salvo indisponível falha sem reconstruir ou gravar documento', async () => {
    const svc = { storage: { from: () => ({ download: async () => ({ error: { message: 'offline' }, data: null }) }) } };
    await expect(convertWorkingDocxToPdf(svc as never, 'r1', { status: 'approved', approved_docx_path: 'r1/saved.docx' } as never)).rejects.toThrow('versão salva');
  });
  it('reconhece arquivos finais isolados por revisão', () => {
    expect(nextPdfVersion(['r/final-v1-r12.pdf', 'r/final-v2-r15.pdf'])).toBe(3);
  });
