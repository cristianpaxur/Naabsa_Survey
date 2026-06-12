import { describe, it, expect } from 'vitest';
import { extract } from './extract';
import {
  sampleSpec,
  buildWorkbook,
  buildCompleteWorkbook,
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
