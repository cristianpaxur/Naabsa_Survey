import { describe, it, expect } from 'vitest';
import { extract, resolveVariant } from './extract';
import {
  sampleSpec,
  buildWorkbook,
  buildCompleteWorkbook,
  sampleSpecV2,
  buildV2Workbook,
} from './synthFixtures';

describe('extract — caminho feliz', () => {
  it('lê common + by_variant e coage os tipos (discharge)', () => {
    const wb = buildCompleteWorkbook();
    const { data, issues } = extract(wb, sampleSpec, 'discharge');
    expect(issues).toHaveLength(0);
    expect(data).toEqual({
      vessel_name: 'MV Cabo Frio',
      cargo_weight: 208450,
      survey_date: '2026-06-06',
      clean: true,
      disch_port: 'Tubarão',
    });
  });

  it('variante loading lê load_port', () => {
    const wb = buildCompleteWorkbook();
    const { data } = extract(wb, sampleSpec, 'loading');
    expect(data.load_port).toBe('Tubarão');
    expect('disch_port' in data).toBe(false);
  });

  it('variant null lê só os campos common', () => {
    const wb = buildCompleteWorkbook();
    const { data } = extract(wb, sampleSpec, null);
    expect('load_port' in data).toBe(false);
    expect('disch_port' in data).toBe(false);
    expect(data.vessel_name).toBe('MV Cabo Frio');
  });
});

describe('extract — issues de extração', () => {
  it('aba ausente → erro', () => {
    const wb = buildWorkbook({ sheet: 'OUTRA' });
    const { issues } = extract(wb, sampleSpec, 'discharge');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.level).toBe('error');
    expect(issues[0]?.message).toContain("Aba 'DADOS'");
  });

  it('fingerprint divergente → erro identificando o encontrado (RF-09)', () => {
    const wb = buildWorkbook({ fingerprint: 'NAABSA-ONOFF' });
    const { issues } = extract(wb, sampleSpec, 'discharge');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.cell).toBe('A1');
    expect(issues[0]?.message).toContain('NAABSA-DRAFT');
    expect(issues[0]?.message).toContain('NAABSA-ONOFF');
  });

  it('erro de coerção em campo numérico vira issue com célula', () => {
    const wb = buildWorkbook({
      cells: { B4: 'MV X', B5: 'abc', B6: 'sim', B8: 'P' },
    });
    const { data, issues } = extract(wb, sampleSpec, 'discharge');
    expect(data.cargo_weight).toBeNull();
    const issue = issues.find((i) => i.field === 'cargo_weight');
    expect(issue?.cell).toBe('B5');
    expect(issue?.message).toContain('não numérico');
  });

  it('célula vazia em campo required → null sem erro de extração (validação é T-007)', () => {
    const wb = buildWorkbook({
      cells: { B5: 208450, B6: new Date(Date.UTC(2026, 0, 1)), B8: 'P' },
    });
    const { data, issues } = extract(wb, sampleSpec, 'discharge');
    expect(data.vessel_name).toBeNull();
    expect(issues).toHaveLength(0);
  });
});

// ── Contrato v2 — multi-aba (CA-009) ────────────────────────────────────────

describe('extract — contrato v2 multi-aba (CA-009)', () => {
  it('lê campos de abas diferentes (Capa e Inicial)', () => {
    const wb = buildV2Workbook();
    const { data, issues } = extract(wb, sampleSpecV2, 'loading');
    expect(issues).toHaveLength(0);
    expect(data.vessel_name).toBe('HG ANTWERP');
    expect(data.init_fwd_mean).toBe(4.78);
  });

  it('aba ausente gera __sheet__ e aborta a extração', () => {
    const wb = buildV2Workbook({ omitInicial: true });
    const { issues } = extract(wb, sampleSpecV2, 'loading');
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0]?.field).toBe('__sheet__');
    expect(issues[0]?.message).toContain("'Inicial'");
  });

  it('fingerprint errado na aba Capa retorna __fingerprint__', () => {
    const wb = buildV2Workbook({ fingerprint: 'ERRADO' });
    const { issues } = extract(wb, sampleSpecV2, null);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.field).toBe('__fingerprint__');
    expect(issues[0]?.message).toContain('DRAFT SURVEY');
    expect(issues[0]?.message).toContain('ERRADO');
  });

  it('variant null extrai só campos common das múltiplas abas', () => {
    const wb = buildV2Workbook();
    const { data, issues } = extract(wb, sampleSpecV2, null);
    expect(issues).toHaveLength(0);
    expect(data.vessel_name).toBe('HG ANTWERP');
    expect(data.init_fwd_mean).toBe(4.78);
  });
});

describe('resolveVariant — CA-009', () => {
  it('Loading → "loading"', () => {
    const wb = buildV2Workbook({ kind: 'Loading' });
    const result = resolveVariant(wb, sampleSpecV2);
    expect(result.variant).toBe('loading');
    expect(result.issue).toBeUndefined();
  });

  it('Discharge → "discharge"', () => {
    const wb = buildV2Workbook({ kind: 'Discharge' });
    const result = resolveVariant(wb, sampleSpecV2);
    expect(result.variant).toBe('discharge');
    expect(result.issue).toBeUndefined();
  });

  it('valor desconhecido → __variant__ com mensagem pt-BR', () => {
    const wb = buildV2Workbook({ kind: 'Ballast' });
    const { variant, issue } = resolveVariant(wb, sampleSpecV2);
    expect(variant).toBeNull();
    expect(issue?.field).toBe('__variant__');
    expect(issue?.level).toBe('error');
    expect(issue?.message).toContain('Ballast');
    expect(issue?.message).toContain('Loading');
    expect(issue?.message).toContain('Discharge');
  });

  it('aba variant_source ausente → __sheet__ issue', () => {
    const wbNoCapa = buildV2Workbook({ omitInicial: true });
    // Capa existe mas testa spec apontando para aba inexistente
    const specSemAba = {
      ...sampleSpecV2,
      source: {
        ...sampleSpecV2.source,
        variant_source: { sheet: 'INEXISTENTE', cell: 'L4', map: { Loading: 'loading' } },
      },
    } as typeof sampleSpecV2;
    const { variant, issue } = resolveVariant(wbNoCapa, specSemAba);
    expect(variant).toBeNull();
    expect(issue?.field).toBe('__sheet__');
    expect(issue?.message).toContain("'INEXISTENTE'");
  });

  it('spec sem variant_source retorna { variant: null }', () => {
    const wb = buildV2Workbook();
    const specSemVS = { ...sampleSpecV2, source: { ...sampleSpecV2.source, variant_source: undefined } };
    const result = resolveVariant(wb, specSemVS);
    expect(result.variant).toBeNull();
    expect(result.issue).toBeUndefined();
  });
});
