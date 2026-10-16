import { createHash } from 'crypto';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import ExcelJS from 'exceljs';
import {
  runExtraction,
  type FieldValue,
  type NumberFormatMap,
  type ReportSpec,
} from '@naabsa/core';
import PizZip from 'pizzip';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as mscBuilder from '../lib/buildDocxMsc';
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
  measureBookmarkPages: vi.fn(async () => ({
    msc_cover_contacts_end: 1,
    ...Object.fromEntries(
      [
        's1',
        's2',
        's3',
        's3_1',
        's3_2',
        's3_3',
        's3_4',
        's3_5',
        's3_6',
        's3_7',
        's3_8',
        's4',
        's5',
        's5_1',
        's5_2',
        's5_3',
        's5_4',
        's5_5',
        's6',
      ].map((id) => [id, 3]),
    ),
  })),
}));
vi.mock('../lib/documentLayoutQa', () => ({
  validateDocumentLayout: async () => ({
    ok: true,
    pageCount: 1,
    blankPages: [],
    aiRequestedSmallerPhotos: false,
  }),
}));

beforeEach(() => {
  convertDocxMock.mockReset();
  convertDocxMock.mockResolvedValue(Buffer.from('PDF'));
});

const visibleText = (xml: string) =>
  [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map((match) =>
      match[1]!.replace(
        /&(?:amp|lt|gt|quot|apos);/g,
        (entity) =>
          ({
            '&amp;': '&',
            '&lt;': '<',
            '&gt;': '>',
            '&quot;': '"',
            '&apos;': "'",
          })[entity]!,
      ),
    )
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
const paragraphTexts = (xml: string) =>
  [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)]
    .map(([paragraph]) => visibleText(paragraph))
    .filter(Boolean);

function mscRenderedFields(paragraphs: string[]) {
  const field = (pattern: RegExp, label: string) => {
    const matches = paragraphs.flatMap((paragraph) => {
      const match = pattern.exec(paragraph);
      return match ? [match[1]!] : [];
    });
    expect(matches, `um único valor renderizado para ${label}`).toHaveLength(1);
    return matches[0]!;
  };
  return {
    voy: field(/^Voy\s+(.+)$/, 'viagem'),
    purifier_temp: field(
      /^Temperature[\s.·…]*:\s*(.+)$/,
      'temperatura do purificador',
    ),
    purifier_flow: field(
      /^Flow setting by each purifier[\s.·…]*:\s*(.+)$/,
      'fluxo do purificador',
    ),
    purifier_bowl_freq: field(
      /^Bowl discharging frequency[\s.·…]*:\s*(.+)$/,
      'frequência do purificador',
    ),
  };
}

describe('precisão efetiva na montagem usada por working DOCX e PDF', () => {
  it('recupera Delivered e horários ausentes da planilha de um relatório já extraído', async () => {
    const spreadsheet = readFileSync(
      new URL(
        '../../../../tests/fixtures/planilhas/draft_survey/draft_survey.real.v1.xlsx',
        import.meta.url,
      ),
    );
    const spec = JSON.parse(
      readFileSync(
        new URL(
          '../../../../tests/fixtures/specs/draft_survey.v1.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lW8UqAAAAABJRU5ErkJggg==',
      'base64',
    );
    const stored = {
      status: 'editing',
      working_docx_path: null,
      working_docx_revision: 0,
      working_docx_generation: 'g1',
      approved_docx_path: null,
      approved_docx_revision: null,
      variant: 'loading',
      spec_id: 's1',
      extracted_data: {
        port: 'PARANAGUA,BRAZIL',
        delivered: null,
        initial_date: '2026-02-08',
        initial_start: null,
        initial_end: '10:00',
        final_date: '2026-05-30',
        final_start: null,
        final_end: '16:00',
      },
      operator_overrides: { initial_end: '10:20' },
      extracted_number_formats: {},
      operator_number_formats: {},
      spreadsheet_path: 'original.xlsx',
      created_by: null,
      pdf_paths: [],
      report_types: { slug: 'draft_survey' },
    };
    const svc = {
      from: (table: string) => {
        let columns = '';
        const query = {
          select: (selected: string) => {
            columns = selected;
            return query;
          },
          eq: () => query,
          is: () => query,
          not: () => query,
          single: async () => ({
            data:
              table === 'report_specs'
                ? { spec }
                : Object.fromEntries(
                    Object.entries(stored).filter(([key]) =>
                      columns.includes(key),
                    ),
                  ),
            error: null,
          }),
          order: async () => ({ data: [], error: null }),
        };
        return query;
      },
      storage: {
        from: () => ({
          download: async (path: string) => ({
            data: {
              arrayBuffer: async () =>
                path === 'original.xlsx' ? spreadsheet : png,
            },
            error: null,
          }),
        }),
      },
    };
    const row = await loadReport(svc as never, 'r1');
    const built = await buildWorkingDocx(svc as never, 'r1', row!);
    expect(built.data['delivered']).toBe(2023);
    expect(built.data['initial_start']).toBe('07:55');
    expect(built.data['final_start']).toBe('14:30');
    expect(built.data['initial_end']).toBe('10:20');
  });

  it('atualiza um horário extraído antigo com o valor atual da planilha quando não há override', async () => {
    const spreadsheet = readFileSync(
      new URL(
        '../../../../tests/fixtures/planilhas/draft_survey/draft_survey.real.v1.xlsx',
        import.meta.url,
      ),
    );
    const spec = JSON.parse(
      readFileSync(
        new URL(
          '../../../../tests/fixtures/specs/draft_survey.v1.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lW8UqAAAAABJRU5ErkJggg==',
      'base64',
    );
    const stored = {
      status: 'editing',
      working_docx_path: null,
      working_docx_revision: 0,
      working_docx_generation: 'g1',
      approved_docx_path: null,
      approved_docx_revision: null,
      variant: 'loading',
      spec_id: 's1',
      extracted_data: {
        initial_date: '2026-02-08',
        initial_start: '07:55',
        initial_end: '08:50',
      },
      operator_overrides: {},
      extracted_number_formats: {},
      operator_number_formats: {},
      spreadsheet_path: 'original.xlsx',
      created_by: null,
      pdf_paths: [],
      report_types: { slug: 'draft_survey' },
    };
    const svc = {
      from: (table: string) => {
        let columns = '';
        const query = {
          select: (selected: string) => {
            columns = selected;
            return query;
          },
          eq: () => query,
          is: () => query,
          not: () => query,
          single: async () => ({
            data:
              table === 'report_specs'
                ? { spec }
                : Object.fromEntries(
                    Object.entries(stored).filter(([key]) =>
                      columns.includes(key),
                    ),
                  ),
            error: null,
          }),
          order: async () => ({ data: [], error: null }),
        };
        return query;
      },
      storage: {
        from: () => ({
          download: async (path: string) => ({
            data: {
              arrayBuffer: async () =>
                path === 'original.xlsx' ? spreadsheet : png,
            },
            error: null,
          }),
        }),
      },
    };

    const row = await loadReport(svc as never, 'r1');
    const built = await buildWorkingDocx(svc as never, 'r1', row!);

    expect(built.data['initial_start']).toBe('07:55');
    expect(built.data['initial_end']).toBe('10:00');
  });

  it.each(['draft_survey', 'msc'])(
    'carrega e resolve mapas no builder %s',
    async (slug) => {
      const stored = {
        status: 'editing',
        working_docx_path: null,
        working_docx_revision: 0,
        working_docx_generation: 'g1',
        approved_docx_path: null,
        approved_docx_revision: null,
        variant: slug === 'msc' ? null : 'loading',
        spec_id: 's1',
        extracted_data: { summer_dwt: 80, net_tonnage: 12000, loa: 228.9 },
        operator_overrides: { summer_dwt: 81 },
        extracted_number_formats: { summer_dwt: 0, net_tonnage: 0 },
        operator_number_formats: { summer_dwt: 1, net_tonnage: 2 },
        spreadsheet_path: null,
        created_by: null,
        pdf_paths: [],
        report_types: { slug },
      };
      const spec = {
        report_type: slug,
        version: 1,
        source: {
          sheet: 'Capa',
          common: {
            fields: {
              summer_dwt: { cell: 'A1', type: 'number', decimals: 3 },
              net_tonnage: { cell: 'A2', type: 'number', decimals: 3 },
              loa: { cell: 'A3', type: 'number', decimals: 3 },
            },
          },
          by_variant: {},
        },
        validations: [],
        photo_slots: [],
      };
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lW8UqAAAAABJRU5ErkJggg==',
        'base64',
      );
      const svc = {
        from: (table: string) => {
          let columns = '';
          const query = {
            select: (selected: string) => {
              columns = selected;
              return query;
            },
            eq: () => query,
            is: () => query,
            not: () => query,
            single: async () => ({
              data:
                table === 'report_specs'
                  ? { spec }
                  : Object.fromEntries(
                      Object.entries(stored).filter(([key]) =>
                        columns.includes(key),
                      ),
                    ),
              error: null,
            }),
            order: async () => ({ data: [], error: null }),
          };
          return query;
        },
        storage: {
          from: () => ({
            download: async () => ({
              data: { arrayBuffer: async () => png },
              error: null,
            }),
          }),
        },
      };
      const row = await loadReport(svc as never, 'r1');
      expect(row).not.toBeNull();
      const built = await buildWorkingDocx(svc as never, 'r1', row!);
      const xml = new PizZip(built.docx).file('word/document.xml')!.asText();
      const fieldText = (label: string) => {
        // MSC particulars are source paragraphs; Draft Survey retains table rows.
        const blocks =
          slug === 'msc'
            ? paragraphTexts(xml)
            : (xml.match(/<w:tr\b[^>]*>.*?<\/w:tr>/gs) ?? []).map(visibleText);
        const entry = blocks.find((block) =>
          block.toLowerCase().includes(label.toLowerCase()),
        );
        expect(entry).toBeDefined();
        return entry!;
      };
      if (slug === 'draft_survey')
        expect(fieldText('Summer DWT').match(/81(?:\.\d+)?/g)).toEqual([
          '81.0',
        ]);
      expect(fieldText('Net tonnage').match(/12,000(?:\.\d+)?/g)).toEqual([
        '12,000',
      ]);
      expect(fieldText('LOA').match(/228(?:\.\d+)?/g)).toEqual(['228.900']);
      expect(built.data).toEqual({
        summer_dwt: 81,
        net_tonnage: 12000,
        loa: 228.9,
      });
      if (slug === 'draft_survey')
        expect(convertDocxMock.mock.calls[0]?.[0]).toEqual(built.docx);
    },
  );
});

describe('MSC — dados efetivos entregues ao builder real (RF-007)', () => {
  const fixtureFields = {
    voy: 'MM623R',
    purifier_temp: 98,
    purifier_flow: '1 x 2,0',
    purifier_bowl_freq: 60,
  };

  afterEach(() => vi.restoreAllMocks());

  async function readMscWorkbook(): Promise<ExcelJS.Workbook> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(
      fileURLToPath(
        new URL(
          '../../../../tests/fixtures/planilhas/msc/msc.real.v1.xlsx',
          import.meta.url,
        ),
      ),
    );
    return workbook;
  }

  async function buildMscCase(
    options: {
      workbook?: ExcelJS.Workbook;
      overrides?: Record<string, FieldValue>;
      operatorNumberFormats?: NumberFormatMap;
      missingExtractedFields?: string[];
      persistedData?: Record<string, FieldValue>;
    } = {},
  ) {
    const workbook = options.workbook ?? (await readMscWorkbook());
    const spec = JSON.parse(
      readFileSync(
        new URL(
          '../../../../tests/fixtures/specs/msc.v1.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ) as ReportSpec;
    const frozenSpec = JSON.stringify(spec);
    const extracted = runExtraction(workbook, spec);
    expect(extracted.issues.filter((issue) => issue.level === 'error')).toEqual(
      [],
    );
    for (const key of options.missingExtractedFields ?? []) {
      delete extracted.data[key];
      delete extracted.numberFormats[key];
    }
    Object.assign(extracted.data, options.persistedData);
    const spreadsheet = Buffer.from(await workbook.xlsx.writeBuffer());
    const stored = {
      status: 'editing',
      working_docx_path: null,
      working_docx_revision: 0,
      working_docx_generation: 'msc-g1',
      approved_docx_path: null,
      approved_docx_revision: null,
      variant: null,
      spec_id: 'msc-spec-v1',
      extracted_data: extracted.data,
      operator_overrides: options.overrides ?? {},
      extracted_number_formats: extracted.numberFormats,
      operator_number_formats: options.operatorNumberFormats ?? {},
      spreadsheet_path: 'msc-original.xlsx',
      created_by: null,
      pdf_paths: [],
      report_types: { slug: 'msc' },
    };
    const specLookup = vi.fn();
    const svc = {
      from: (table: string) => {
        let columns = '';
        const query = {
          select: (selected: string) => {
            columns = selected;
            return query;
          },
          eq: (column: string, value: unknown) => {
            if (table === 'report_specs') specLookup(column, value);
            return query;
          },
          is: () => query,
          not: () => query,
          single: async () => ({
            data:
              table === 'report_specs'
                ? { spec }
                : Object.fromEntries(
                    Object.entries(stored).filter(([key]) =>
                      columns.includes(key),
                    ),
                  ),
            error: null,
          }),
          order: async () => ({ data: [], error: null }),
        };
        return query;
      },
      storage: {
        from: () => ({
          download: async (path: string) => {
            expect(path).toBe('msc-original.xlsx');
            return {
              data: { arrayBuffer: async () => spreadsheet },
              error: null,
            };
          },
        }),
      },
    };
    // Observa o builder sem substituir sua implementação: as asserções abaixo
    // cobrem tanto os dados recebidos nas duas passagens quanto o DOCX produzido.
    const builderSpy = vi.spyOn(mscBuilder, 'buildReportDocxMsc');
    const row = await loadReport(svc as never, 'msc-report');
    expect(row?.type_slug).toBe('msc');
    expect(row?.spec_id).toBe('msc-spec-v1');
    const built = await buildWorkingDocx(svc as never, 'msc-report', row!);
    expect(specLookup).toHaveBeenCalledTimes(1);
    expect(specLookup).toHaveBeenCalledWith('id', 'msc-spec-v1');
    expect(JSON.stringify(spec)).toBe(frozenSpec);
    expect(builderSpy).toHaveBeenCalledTimes(2);
    const inputs = builderSpy.mock.calls.map(([input]) => input);
    const xml = new PizZip(built.docx).file('word/document.xml')!.asText();
    const paragraphs = paragraphTexts(xml);
    return {
      built,
      inputs,
      text: paragraphs.join('\n'),
      rendered: mscRenderedFields(paragraphs),
    };
  }

  it('entrega viagem e purificadores extraídos da fixture e imprime suas unidades', async () => {
    const { built, inputs, rendered } = await buildMscCase();

    expect(built.variant).toBeNull();
    expect(built.data).toMatchObject(fixtureFields);
    for (const input of inputs) expect(input.data).toMatchObject(fixtureFields);
    expect(rendered).toEqual({
      voy: 'MM623R',
      purifier_temp: '98 °C',
      purifier_flow: '1 x 2,0 m³',
      purifier_bowl_freq: '60 minutes',
    });
  });

  it.each([
    [{}, 24.1589, 24158.9],
    [{ light_ship: 0 }, 24.1589, 0],
    [{ light_ship: '' }, 24.1589, ''],
    [{}, 26000, 26000],
  ] as const)(
    'corrige somente a leitura antiga comprovada do Light ship: %j',
    async (overrides, persisted, expected) => {
      const workbook = await readMscWorkbook();
      workbook.getWorksheet('Summary')!.getCell('B35').value = '24,158.9';
      const { built, text } = await buildMscCase({
        workbook,
        overrides,
        persistedData: { light_ship: persisted },
      });
      expect(built.data.light_ship).toBe(expected);
      if (expected === 24158.9) expect(text).toMatch(/Light ship.*24,158\.90/);
    },
  );

  it('recupera quantidades que não existiam no spec antigo sem perder overrides', async () => {
    const { built, inputs, text } = await buildMscCase({
      missingExtractedFields: [
        'grade_1_surveyor',
        'grade_1_vrs',
        'sludge_surveyor',
        'sludge_disposed',
        'retained_chief',
      ],
      overrides: { grade_1_vrs: 0, sludge_surveyor: '' },
    });
    expect(built.data.grade_1_surveyor).toEqual(
      inputs[0]!.data.grade_1_surveyor,
    );
    expect(typeof built.data.grade_1_surveyor).toBe('number');
    expect(built.data.grade_1_vrs).toBe(0);
    expect(built.data.sludge_surveyor).toBe('');
    expect(built.data.sludge_disposed).toBeCloseTo(47.02, 9);
    expect(built.data.retained_chief).toBeCloseTo(16.68, 9);
    expect(text).toMatch(/Quantity disposed[\s.·…]*: 47\.02\b/);
    expect(text).toMatch(/Quantity retained[\s.·…]*: 16\.68\b/);
    expect(text).toContain('0.000');
  });

  it('preserva zero, limpeza explícita e precisão manual nas novas quantidades', async () => {
    const { built, text } = await buildMscCase({
      missingExtractedFields: ['sludge_disposed', 'retained_chief'],
      overrides: { sludge_disposed: 0, retained_chief: '' },
      operatorNumberFormats: { sludge_disposed: 3 },
    });
    expect(built.data.sludge_disposed).toBe(0);
    expect(built.data.retained_chief).toBe('');
    expect(text).toMatch(/Quantity disposed[\s.·…]*: 0\.000\b/);
    expect(text).toMatch(/Quantity retained[\s.·…]*: —/);
  });

  it('prioriza os overrides e a precisão salva pelo operador nas duas passagens', async () => {
    const overrides = {
      voy: 'OVERRIDE-VOY',
      purifier_temp: 105,
      purifier_flow: '2 x 3,0',
      purifier_bowl_freq: 75,
    };
    const numberFormats = { purifier_temp: 1, purifier_bowl_freq: 2 };
    const { built, inputs, text, rendered } = await buildMscCase({
      overrides,
      operatorNumberFormats: numberFormats,
    });

    expect(built.data).toMatchObject(overrides);
    for (const input of inputs) {
      expect(input.data).toMatchObject(overrides);
      expect(input.numberFormats).toMatchObject(numberFormats);
    }
    expect(rendered).toEqual({
      voy: 'OVERRIDE-VOY',
      purifier_temp: '105.0 °C',
      purifier_flow: '2 x 3,0 m³',
      purifier_bowl_freq: '75.00 minutes',
    });
    expect(text).not.toContain('MM623R');
  });

  it('preserva zero e limpeza explícita sem recuperar os valores originais da planilha', async () => {
    const overrides = {
      voy: '',
      purifier_temp: 0,
      purifier_flow: '',
      purifier_bowl_freq: 0,
    };
    const { built, inputs, text, rendered } = await buildMscCase({ overrides });

    expect(built.data).toMatchObject(overrides);
    for (const input of inputs) expect(input.data).toMatchObject(overrides);
    expect(rendered).toEqual({
      voy: '—',
      purifier_temp: '0 °C',
      purifier_flow: '— m³',
      purifier_bowl_freq: '0 minutes',
    });
    expect(text).not.toContain('MM623R');
    expect(text).not.toContain('98 °C');
    expect(text).not.toContain('1 x 2,0 m³');
    expect(text).not.toContain('60 minutes');
  });

  it('preserva a limpeza explícita dos purificadores numéricos como ausência, sem transformá-la em zero', async () => {
    const overrides = { purifier_temp: '', purifier_bowl_freq: '' };
    const { built, inputs, rendered } = await buildMscCase({ overrides });

    expect(built.data).toMatchObject({ ...fixtureFields, ...overrides });
    for (const input of inputs)
      expect(input.data).toMatchObject({ ...fixtureFields, ...overrides });
    expect(rendered).toEqual({
      voy: 'MM623R',
      purifier_temp: '— °C',
      purifier_flow: '1 x 2,0 m³',
      purifier_bowl_freq: '— minutes',
    });
    expect(rendered.purifier_temp).not.toBe('0 °C');
    expect(rendered.purifier_bowl_freq).not.toBe('0 minutes');
  });

  it('mantém indicação de ausência no DOCX quando as células de origem estão vazias', async () => {
    const workbook = await readMscWorkbook();
    workbook.getWorksheet('Summary')!.getCell('B8').value = null;
    for (const cell of ['K29', 'K30', 'K31'])
      workbook.getWorksheet('Sludge')!.getCell(cell).value = null;
    const absentFields = {
      voy: null,
      purifier_temp: null,
      purifier_flow: null,
      purifier_bowl_freq: null,
    };
    const { built, inputs, text, rendered } = await buildMscCase({ workbook });

    expect(built.data).toMatchObject(absentFields);
    for (const input of inputs) expect(input.data).toMatchObject(absentFields);
    expect(rendered).toEqual({
      voy: '—',
      purifier_temp: '— °C',
      purifier_flow: '— m³',
      purifier_bowl_freq: '— minutes',
    });
    expect(text).not.toContain('MM623R');
    expect(rendered.purifier_temp).not.toBe('0 °C');
    expect(rendered.purifier_bowl_freq).not.toBe('0 minutes');
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
    expect(
      missingRequiredSheetPhases(
        { initial: null, intermediate: null, final: png },
        false,
      ),
    ).toEqual(['initial']);
  });

  it('exige as três imagens quando há fase intermediária', () => {
    expect(
      missingRequiredSheetPhases(
        { initial: png, intermediate: null, final: png },
        true,
      ),
    ).toEqual(['intermediate']);
  });
});

describe('convertWorkingDocxToPdf (012/T-005..T-007, CA-004)', () => {
  it('converte o working.docx EDITADO (sem reconstruir dos dados) e hash = sha256 do binário', async () => {
    const edited = Buffer.from('DOCX-EDITADO-NO-COLLABORA');
    const svc = {
      storage: {
        from: () => ({
          download: async (path: string) => {
            expect(path).toBe('r1/working/approved.docx');
            return { data: { arrayBuffer: async () => edited }, error: null };
          },
        }),
      },
      // Se o job tentar reconstruir dos dados (spec/planilha), o teste falha:
      from: () => {
        throw new Error(
          'não deveria reconstruir dos dados quando working.docx existe',
        );
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
      storage: {
        from: () => ({
          download: async () => ({
            data: { arrayBuffer: async () => Buffer.from('DOCX') },
            error: null,
          }),
        }),
      },
    };
    await expect(
      convertWorkingDocxToPdf(svc as never, 'r1', {
        status: 'approved',
        approved_docx_path: 'r1/saved.docx',
      } as never),
    ).rejects.toThrow('Não foi possível converter o documento salvo em PDF');
  });
});

it('arquivo salvo indisponível falha sem reconstruir ou gravar documento', async () => {
  const svc = {
    storage: {
      from: () => ({
        download: async () => ({ error: { message: 'offline' }, data: null }),
      }),
    },
  };
  await expect(
    convertWorkingDocxToPdf(svc as never, 'r1', {
      status: 'approved',
      approved_docx_path: 'r1/saved.docx',
    } as never),
  ).rejects.toThrow('versão salva');
});
it('reconhece arquivos finais isolados por revisão', () => {
  expect(nextPdfVersion(['r/final-v1-r12.pdf', 'r/final-v2-r15.pdf'])).toBe(3);
});
