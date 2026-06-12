import { describe, it, expect } from 'vitest';
import { validate } from './validate';
import { runExtraction } from './pipeline';
import {
  sampleSpec,
  buildWorkbook,
  buildCompleteWorkbook,
} from './synthFixtures';
import type { ReportSpec } from '../types';

describe('validate — por campo', () => {
  it('required vazio → erro com label e célula (RF-08)', () => {
    const issues = validate(
      { vessel_name: null, survey_date: null, cargo_weight: 100 },
      sampleSpec,
      'discharge',
    );
    const vessel = issues.find((i) => i.field === 'vessel_name');
    expect(vessel?.level).toBe('error');
    expect(vessel?.message).toBe("Campo 'Nome do navio' vazio na célula B4.");
    expect(issues.some((i) => i.field === 'survey_date')).toBe(true);
  });

  it('campo opcional vazio não gera issue', () => {
    const issues = validate(
      { vessel_name: 'MV X', survey_date: '2026-01-01', clean: null },
      sampleSpec,
      'discharge',
    );
    expect(issues.some((i) => i.field === 'clean')).toBe(false);
  });

  it('pattern não correspondido → erro', () => {
    const spec = patternSpec();
    const ok = validate({ imo: 'IMO9456123' }, spec, null);
    expect(ok).toHaveLength(0);
    const bad = validate({ imo: '123' }, spec, null);
    expect(bad[0]?.message).toContain('formato esperado');
  });
});

describe('validate — regras cruzadas', () => {
  it('range warning (cargo_weight acima do máximo)', () => {
    const issues = validate(
      { vessel_name: 'MV X', survey_date: '2026-01-01', cargo_weight: 208450 },
      sampleSpec,
      'discharge',
    );
    const range = issues.find((i) => i.field === 'cargo_weight');
    expect(range?.level).toBe('warning');
    expect(range?.message).toContain('fora do intervalo usual');
  });

  it('range dentro dos limites → sem issue', () => {
    const issues = validate(
      { vessel_name: 'MV X', survey_date: '2026-01-01', cargo_weight: 1000 },
      sampleSpec,
      'discharge',
    );
    expect(issues.some((i) => i.field === 'cargo_weight')).toBe(false);
  });

  it('compare error (data fim < início)', () => {
    const spec = compareSpec();
    const bad = validate(
      { start_date: '2026-06-10', end_date: '2026-06-05' },
      spec,
      null,
    );
    expect(bad[0]?.level).toBe('error');
    expect(bad[0]?.message).toBe('Data de fim anterior à de início.');
    const good = validate(
      { start_date: '2026-06-01', end_date: '2026-06-05' },
      spec,
      null,
    );
    expect(good).toHaveLength(0);
  });
});

describe('runExtraction — integração', () => {
  it('caminho completo: dados + warning de range', () => {
    const { data, issues } = runExtraction(
      buildCompleteWorkbook(),
      sampleSpec,
      'discharge',
    );
    expect(data.vessel_name).toBe('MV Cabo Frio');
    // cargo_weight 208450 > 200000 → 1 warning
    expect(issues).toHaveLength(1);
    expect(issues[0]?.level).toBe('warning');
  });

  it('fingerprint divergente bloqueia: só o erro de fingerprint, sem ruído de validação', () => {
    const { issues } = runExtraction(
      buildWorkbook({ fingerprint: 'X' }),
      sampleSpec,
      'discharge',
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.field).toBe('__fingerprint__');
  });
});

function patternSpec(): ReportSpec {
  return {
    report_type: 'x',
    version: 1,
    variants: [],
    source: {
      sheet: 'D',
      fingerprint: { cell: 'A1', expect: 'X' },
      common: {
        fields: {
          imo: {
            cell: 'B1',
            type: 'string',
            label: 'IMO',
            section: 'S',
            pattern: '^IMO[0-9]{7}$',
          },
        },
      },
    },
  };
}

function compareSpec(): ReportSpec {
  return {
    report_type: 'x',
    version: 1,
    variants: [],
    source: {
      sheet: 'D',
      fingerprint: { cell: 'A1', expect: 'X' },
      common: {
        fields: {
          start_date: {
            cell: 'B1',
            type: 'date',
            format: 'DD/MM/YYYY',
            label: 'Início',
            section: 'S',
          },
          end_date: {
            cell: 'B2',
            type: 'date',
            format: 'DD/MM/YYYY',
            label: 'Fim',
            section: 'S',
          },
        },
      },
    },
    validations: [
      {
        rule: 'compare',
        left: 'end_date',
        op: '>=',
        right: 'start_date',
        level: 'error',
        message: 'Data de fim anterior à de início.',
      },
    ],
  };
}
