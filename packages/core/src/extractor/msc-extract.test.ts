import { beforeAll, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runExtraction } from './pipeline';
import { validateSpec } from '../spec-schema/validateSpec';
import { validate } from './validate';
import { resolveFieldValue } from '../resolveFieldValue';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '../../../../tests/fixtures');
const xlsxPath = join(fixtures, 'planilhas/msc/msc.real.v1.xlsx');
const specPath = join(fixtures, 'specs/msc.v1.json');

let workbook: ExcelJS.Workbook;
let spec: ReturnType<typeof validateSpec> & { valid: true };

const expectedVideoFields = {
  voy: 'MM623R',
  purifier_temp: 98,
  purifier_flow: '1 x 2,0',
  purifier_bowl_freq: 60,
};
const videoSources = [
  ['voy', 'Summary', 'B8'],
  ['purifier_temp', 'Sludge', 'K29'],
  ['purifier_flow', 'Sludge', 'K30'],
  ['purifier_bowl_freq', 'Sludge', 'K31'],
] as const;

async function readFixtureWorkbook(): Promise<ExcelJS.Workbook> {
  const fixtureWorkbook = new ExcelJS.Workbook();
  await fixtureWorkbook.xlsx.readFile(xlsxPath);
  return fixtureWorkbook;
}

beforeAll(async () => {
  const result = validateSpec(JSON.parse(readFileSync(specPath, 'utf8')) as unknown);
  if (!result.valid) throw new Error(result.errors.join('; '));
  spec = result as typeof spec;
  workbook = await readFixtureWorkbook();
});

describe('MSC — contrato da planilha SABRINA', () => {
  it('aceita o spec e a planilha com todas as abas de origem', () => {
    expect(spec.valid).toBe(true);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(expect.arrayContaining([
      'Summary', 'Time Log', 'Sludge', 'Qtt Sumary', 'LOG Audit',
    ]));
  });

  it('extrai as seções que alimentam o relatório sem erros', () => {
    const { data, issues } = runExtraction(workbook, spec.spec);
    expect(issues.filter((issue) => issue.level === 'error')).toEqual([]);
    expect(data.vessel_name).toBeTruthy();
    expect(data.loa).not.toBeNull();
    expect(data.lbp).not.toBeNull();
    expect(Object.keys(data)).toEqual(expect.arrayContaining([
      'grade_1_surveyor', 'sludge_surveyor', 'flowmeter_accuracy',
      'logbook_updated', 'vrs_updated',
    ]));
  });

  it('extrai os valores exatos de viagem e purificadores usados no documento (RF-007)', () => {
    expect(runExtraction(workbook, spec.spec).data).toMatchObject(expectedVideoFields);
  });

  it.each([
    ['purifier_temp', 'K29'],
    ['purifier_bowl_freq', 'K31'],
  ] as const)('preserva zero em %s sem alterar a fixture compartilhada', async (field, cell) => {
    const caseWorkbook = await readFixtureWorkbook();
    caseWorkbook.getWorksheet('Sludge')!.getCell(cell).value = 0;

    const { data, issues } = runExtraction(caseWorkbook, spec.spec);

    expect(data).toMatchObject({ ...expectedVideoFields, [field]: 0 });
    expect(issues.filter((issue) => issue.field === field)).toEqual([]);
    expect(runExtraction(workbook, spec.spec).data).toMatchObject(expectedVideoFields);
  });

  it.each(videoSources)('mantém ausência quando a célula de %s está realmente vazia', async (field, sheet, cell) => {
    const caseWorkbook = await readFixtureWorkbook();
    const sourceCell = caseWorkbook.getWorksheet(sheet)!.getCell(cell);
    sourceCell.value = null;
    expect(sourceCell.type).toBe(ExcelJS.ValueType.Null);

    const { data, issues } = runExtraction(caseWorkbook, spec.spec);

    expect(data).toMatchObject({ ...expectedVideoFields, [field]: null });
    expect(issues.filter((issue) => issue.field === field)).toEqual([
      expect.objectContaining({ field, cell, level: 'warning', origin: 'validation' }),
    ]);
    expect(runExtraction(workbook, spec.spec).data).toMatchObject(expectedVideoFields);
  });
});

describe('MSC — pendências dos campos de viagem e purificadores (RF-007)', () => {
  it.each([null, undefined, '', ' \t\n '])('informa origem e preenchimento quando o valor efetivo está ausente: %j', (value) => {
    const data = { ...runExtraction(workbook, spec.spec).data };
    for (const [field] of videoSources) {
      if (value === undefined) delete data[field];
      else data[field] = value;
    }

    const issues = validate(data, spec.spec, null);

    expect(issues).toHaveLength(videoSources.length);
    for (const [field, sheet, cell] of videoSources) {
      const fieldIssues = issues.filter((issue) => issue.field === field);
      expect(fieldIssues).toEqual([
        expect.objectContaining({ field, cell, level: 'warning', origin: 'validation' }),
      ]);
      expect(fieldIssues[0]!.message).toContain(spec.spec.source.common.fields[field]!.label);
      expect(fieldIssues[0]!.message).toContain(`${sheet}!${cell}`);
      expect(fieldIssues[0]!.message).toMatch(/Confira.*preencha/);
    }
    expect(data).not.toMatchObject(expectedVideoFields);
  });

  it.each(videoSources)('remove a pendência de %s após resolver um override válido', (field) => {
    const extracted = { ...runExtraction(workbook, spec.spec).data, [field]: null };
    expect(validate(extracted, spec.spec, null).filter((issue) => issue.field === field)).toHaveLength(1);
    const effective = { ...extracted, [field]: resolveFieldValue(field, { [field]: expectedVideoFields[field] }, extracted) };

    expect(validate(effective, spec.spec, null).filter((issue) => issue.field === field)).toEqual([]);
    expect(extracted[field]).toBeNull();
    expect(effective[field]).toBe(expectedVideoFields[field]);
  });

  it.each(videoSources)('preserva erro obrigatório de %s sem adicionar aviso duplicado', (field, _sheet, cell) => {
    const requiredSpec = structuredClone(spec.spec);
    requiredSpec.source.common.fields[field]!.required = true;
    const data = { ...runExtraction(workbook, spec.spec).data, [field]: null };

    expect(validate(data, requiredSpec, null).filter((issue) => issue.field === field)).toEqual([
      expect.objectContaining({ field, cell, level: 'error', origin: 'validation' }),
    ]);
  });

  it('preserva o comportamento de campos opcionais fora do MSC', () => {
    const otherSpec = structuredClone(spec.spec);
    otherSpec.report_type = 'draft_survey';
    const data = { ...runExtraction(workbook, spec.spec).data };
    for (const [field] of videoSources) data[field] = null;

    expect(validate(data, otherSpec, null)).toEqual([]);
  });

  it('não transforma outros campos opcionais do MSC em pendências', () => {
    const data = { ...runExtraction(workbook, spec.spec).data, temp_engine_room: null };

    expect(validate(data, spec.spec, null)).toEqual([]);
  });

  it('usa a aba padrão quando o campo não define uma aba própria', () => {
    const singleSheetSpec = structuredClone(spec.spec);
    singleSheetSpec.source.sheet = 'Summary';
    delete singleSheetSpec.source.common.fields['voy']!.sheet;
    const data = { ...runExtraction(workbook, spec.spec).data, voy: null };

    const issues = validate(data, singleSheetSpec, null).filter((issue) => issue.field === 'voy');

    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain('Summary!B8');
  });

  it('não inventa pendências para campos que não existem no spec congelado', () => {
    const historicalSpec = structuredClone(spec.spec);
    delete historicalSpec.source.common.fields['voy'];
    const data = { ...runExtraction(workbook, spec.spec).data, voy: null };

    expect(validate(data, historicalSpec, null)).toEqual([]);
  });
});
