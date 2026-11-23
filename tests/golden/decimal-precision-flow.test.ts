import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import PizZip from '../../apps/worker/node_modules/pizzip';
import {
  runExtraction,
  type FieldValue,
  type ReportSpec,
} from '../../packages/core/src';
import { groupBySectionOrdered } from '../../apps/web/lib/effective-values';
import { parseLocalizedNumberDraft } from '../../apps/web/lib/localized-number';
import { buildReportDocx } from '../../apps/worker/src/lib/buildDocx';

describe('precisão decimal ponta a ponta', () => {
  it('preserva números e zeros de exibição do Excel ao DOCX após override', async () => {
    const spec = JSON.parse(
      readFileSync(
        new URL('../fixtures/specs/draft_survey.v1.json', import.meta.url),
        'utf8',
      ),
    ) as ReportSpec;
    const workbook = new ExcelJS.Workbook();
    for (const sheetName of [
      'Capa',
      'Inicial',
      'Intermediario',
      'final',
      'DS INTERMEDIATE',
      'DS FINAL',
    ]) {
      workbook.addWorksheet(sheetName);
    }

    const cover = workbook.getWorksheet('Capa')!;
    cover.getCell('B2').value = 'DRAFT SURVEY';
    cover.getCell('L4').value = 'Loading';
    cover.getCell('C24').value = 12;
    cover.getCell('C24').numFmt = '0.0';
    cover.getCell('C25').value = 24;
    cover.getCell('C25').numFmt = '0.00';
    cover.getCell('C26').value = 81;
    cover.getCell('C26').numFmt = '0.000';

    const extraction = runExtraction(workbook, spec, 'loading');
    expect(extraction.data).toMatchObject({
      net_tonnage: 12,
      gross_tonnage: 24,
      summer_dwt: 81,
    });
    expect([
      typeof extraction.data.net_tonnage,
      typeof extraction.data.gross_tonnage,
      typeof extraction.data.summer_dwt,
    ]).toEqual(['number', 'number', 'number']);
    expect(extraction.numberFormats).toEqual({
      net_tonnage: 1,
      gross_tonnage: 2,
      summer_dwt: 3,
    });

    const report = JSON.parse(
      JSON.stringify({
        extracted_data: extraction.data,
        extracted_number_formats: extraction.numberFormats,
        operator_overrides: {} as Record<string, FieldValue>,
        operator_number_formats: {},
      }),
    ) as {
      extracted_data: Record<string, FieldValue>;
      extracted_number_formats: Record<string, number>;
      operator_overrides: Record<string, FieldValue>;
      operator_number_formats: Record<string, number>;
    };
    expect(report.extracted_number_formats).toEqual({
      net_tonnage: 1,
      gross_tonnage: 2,
      summer_dwt: 3,
    });
    expect(typeof report.extracted_data.summer_dwt).toBe('number');

    const override = parseLocalizedNumberDraft('81.0000');
    expect(override).toEqual({ value: 81, decimals: 4 });
    report.operator_overrides.summer_dwt = override!.value;
    report.operator_number_formats.summer_dwt = override!.decimals!;

    const effectiveFields = groupBySectionOrdered(
      spec,
      'loading',
      report.extracted_data,
      report.operator_overrides,
      report.extracted_number_formats,
      report.operator_number_formats,
    ).flatMap((section) => section.fields);
    const selectedFields = effectiveFields
      .filter(({ name }) =>
        ['net_tonnage', 'gross_tonnage', 'summer_dwt'].includes(name),
      )
      .map(({ name, value, displayDecimals, isOverride }) => ({
        name,
        value,
        displayDecimals,
        isOverride,
        valueType: typeof value,
      }));
    expect(selectedFields).toEqual([
      {
        name: 'net_tonnage',
        value: 12,
        displayDecimals: 1,
        isOverride: false,
        valueType: 'number',
      },
      {
        name: 'gross_tonnage',
        value: 24,
        displayDecimals: 2,
        isOverride: false,
        valueType: 'number',
      },
      {
        name: 'summer_dwt',
        value: 81,
        displayDecimals: 4,
        isOverride: true,
        valueType: 'number',
      },
    ]);

    const effectiveData = Object.fromEntries(
      effectiveFields.map(({ name, value }) => [name, value]),
    );
    const effectiveNumberFormats = Object.fromEntries(
      effectiveFields.flatMap(({ name, displayDecimals }) =>
        displayDecimals === undefined ? [] : [[name, displayDecimals]],
      ),
    );
    const docx = await buildReportDocx({
      data: effectiveData,
      numberFormats: effectiveNumberFormats,
      variant: 'loading',
      logo: null,
      sheetImages: {},
      phasePhotos: {},
      acting: {},
    });
    const documentXml = new PizZip(docx).file('word/document.xml')!.asText();
    const summerDwtRow = (
      documentXml.match(/<w:tr\b[^>]*>.*?<\/w:tr>/gs) ?? []
    ).find((row) => row.includes('Summer DWT'));
    expect(summerDwtRow).toBeDefined();
    const summerDwtText = [
      ...summerDwtRow!.matchAll(/<w:t(?:\s[^>]*)?>(.*?)<\/w:t>/gs),
    ]
      .map((match) => match[1])
      .join('');

    expect(summerDwtText.match(/81(?:\.\d+)?/g)).toEqual(['81.0000']);
    expect(documentXml).toContain('81.0000');
  });
});
