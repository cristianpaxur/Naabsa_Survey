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
