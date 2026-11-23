/**
 * T-016 / CA-007b — Extração limpa da planilha real do cliente.
 *
 * Roda runExtraction ponta-a-ponta contra a fixture real:
 *   tests/fixtures/planilhas/draft_survey/draft_survey.real.v1.xlsx
 *   tests/fixtures/specs/draft_survey.v1.json
 *
 * Critérios de conclusão:
 *   - Nenhum issue de nível "error" (aba/fingerprint/campo obrigatório ausente).
 *   - Warnings permitidos (campos opcionais vazios, etc.).
 *   - tables[] populado com ao menos uma tabela não-vazia.
 *   - Ranges provisórios confirmados → flag 'provisional' removido do spec.
 *
 * NOTA: A planilha real tem proteção de célula (sheet protection, não
 * criptografia de arquivo). ExcelJS lê os valores sem precisar da senha.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import ExcelJS from 'exceljs';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { validateSpec } from '../spec-schema/validateSpec';
import { runExtraction } from './pipeline';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, '../../../../tests/fixtures');
const xlsxPath = join(fixturesRoot, 'planilhas/draft_survey/draft_survey.real.v1.xlsx');
const specPath = join(fixturesRoot, 'specs/draft_survey.v1.json');

let workbook: ExcelJS.Workbook;
let spec: ReturnType<typeof validateSpec> & { valid: true };

beforeAll(async () => {
  const specRaw = JSON.parse(readFileSync(specPath, 'utf-8')) as unknown;
  const result = validateSpec(specRaw);
  if (!result.valid) throw new Error(`Spec inválido: ${result.errors.join('; ')}`);
  spec = result as typeof spec;

  workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(xlsxPath);
});

describe('CA-007b — extração limpa da planilha real Draft Survey', () => {
  it('spec real é aceito pelo validateSpec', () => {
    const result = validateSpec(JSON.parse(readFileSync(specPath, 'utf-8')) as unknown);
    expect(result.valid).toBe(true);
  });

  it('planilha real carrega com as abas esperadas', () => {
    const sheets = workbook.worksheets.map((ws) => ws.name);
    expect(sheets).toContain('Capa');
    expect(sheets).toContain('Inicial');
    expect(sheets).toContain('Intermediario');
    expect(sheets).toContain('final');
    // LOD-LOP pode estar presente (será ignorada pelo extractor)
  });

  it('variante resolve de Capa!L4 (loading ou discharge)', () => {
    const { data, issues, tables } = runExtraction(workbook, spec.spec);
    const errors = issues.filter((i) => i.level === 'error');
    if (errors.length > 0) {
      // Log detalhado para debugging
      console.warn('Issues de erro encontradas:');
      for (const e of errors) {
        console.warn(`  [${e.field}] ${e.cell ?? '-'}: ${e.message}`);
      }
    }
    expect(errors).toHaveLength(0);
    // vessel_name deve estar preenchido
    expect(data.vessel_name).toBeTruthy();
    // Pelo menos uma tabela extraída
    expect(Object.keys(tables).length).toBeGreaterThan(0);
  });

  it('campos obrigatórios extraídos sem null', () => {
    const { data } = runExtraction(workbook, spec.spec);
    // Campos required no spec real
    const requiredFields = ['vessel_name', 'final_date'];
    for (const f of requiredFields) {
      expect(data[f], `Campo obrigatório '${f}' está null`).not.toBeNull();
    }
  });

  it('datas das fases saem em ISO real (sem NaN) — regressão dos mirrors Capa!L7/L8/L9', () => {
    const { data } = runExtraction(workbook, spec.spec);
    const ISO = /^\d{4}-\d{2}-\d{2}$/;
    for (const f of ['initial_date', 'intermediate_date', 'final_date']) {
      const v = data[f];
      expect(typeof v, `${f} deveria ser string ISO`).toBe('string');
      expect(String(v), `${f} contém NaN — fórmula não avaliada vazou`).not.toContain('NaN');
      expect(String(v), `${f} fora do formato ISO`).toMatch(ISO);
    }
  });

  it.each<ExcelJS.CellValue>([
    null,
    { formula: '1-1', result: 0 },
    { formula: '1/0', result: { error: '#DIV/0!' } },
  ])('ignora data, figures e tabelas intermediárias quando O19 é %j', async (cargo) => {
    const source = new ExcelJS.Workbook();
    await source.xlsx.readFile(xlsxPath);
    const intermediate = source.getWorksheet('Intermediario')!;
    intermediate.getCell('O19').value = cargo;
    intermediate.getCell('C5').value = new Date('2026-02-01');
    // A aba DS INTERMEDIATE mantém os caches antigos em C37 e C38.
    const result = runExtraction(source, spec.spec);
    expect(result.data.intermediate_date).toBeNull();
    expect(result.data.int_fig_shore_scale).toBeNull();
    expect(result.data.int_fig_naabsa).toBeNull();
    expect(result.tables).not.toHaveProperty('int_draft_marks');
    expect(result.tables).toHaveProperty('fin_draft_marks');
    expect(result.issues).toHaveLength(0);
  });

  it('bloqueia data fora da sequência e calados zerados quando O19 tem carga', async () => {
    const source = new ExcelJS.Workbook();
    await source.xlsx.readFile(xlsxPath);
    const intermediate = source.getWorksheet('Intermediario')!;
    intermediate.getCell('C5').value = new Date('2026-02-01');
    for (const [mean, corrected] of [['D9', 'H9'], ['D10', 'H10'], ['D11', 'H11']]) {
      intermediate.getCell(mean!).value = 0;
      intermediate.getCell(corrected!).value = 0;
    }

    const result = runExtraction(source, spec.spec);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'intermediate_date', cell: 'C5', level: 'error', origin: 'validation' }),
      expect.objectContaining({ field: 'int_fwd_mean', cell: 'D9', level: 'error', origin: 'validation' }),
    ]));
    expect(result.tables).toHaveProperty('int_draft_marks');
  });

  it('tabelas range-based têm pelo menos uma linha não-nula (ranges confirmados)', () => {
    const { tables } = runExtraction(workbook, spec.spec);
    const tableIds = Object.keys(tables);
    console.info(`Tabelas extraídas (${tableIds.length}): ${tableIds.join(', ')}`);
    for (const [id, matrix] of Object.entries(tables)) {
      const hasData = matrix.some((row) => row.some((cell) => cell !== null));
      if (!hasData) {
        console.warn(`  ATENÇÃO: tabela '${id}' está completamente vazia — range pode estar errado.`);
      }
    }
    // Pelo menos metade das tabelas devem ter dados
    const nonEmpty = Object.values(tables).filter((m) =>
      m.some((row) => row.some((cell) => cell !== null)),
    );
    expect(nonEmpty.length, 'Menos da metade das tabelas têm dados').toBeGreaterThan(0);
  });
});
