import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateSpec } from './validateSpec';
import type { ReportSpec } from '../types';

const here = dirname(fileURLToPath(import.meta.url));
const REAL_SPEC_PATH = join(
  here,
  '../../../../tests/fixtures/specs/draft_survey.v1.json',
);

const validSpec = {
  report_type: 'on_off_hire',
  version: 1,
  variants: ['on_hire', 'off_hire'],
  source: {
    sheet: 'DADOS',
    fingerprint: { cell: 'A1', expect: 'NAABSA-ONOFF' },
    common: {
      fields: {
        vessel_name: {
          cell: 'B4',
          type: 'string',
          required: true,
          label: 'Nome do navio',
          section: 'Identificação',
        },
        cargo_weight: {
          cell: 'C18',
          type: 'number',
          decimals: 0,
          label: 'Peso de carga',
          section: 'Carga',
        },
        survey_date: {
          cell: 'B7',
          type: 'date',
          format: 'DD/MMM/YYYY',
          required: true,
          label: 'Data do survey',
          section: 'Survey',
        },
        op_kind: {
          cell: 'B9',
          type: 'enum',
          options: ['Carregamento', 'Descarga'],
          label: 'Operação',
          section: 'Operação',
        },
        clean: {
          cell: 'B10',
          type: 'boolean',
          label: 'Porão limpo',
          section: 'Operação',
        },
      },
    },
    by_variant: {
      on_hire: {
        fields: {
          delivery_date: {
            cell: 'B11',
            type: 'date',
            format: 'DD/MMM/YYYY',
            required: true,
            label: 'Data de entrega',
            section: 'Operação',
          },
        },
      },
      off_hire: {
        fields: {
          redelivery_date: {
            cell: 'B11',
            type: 'date',
            format: 'DD/MMM/YYYY',
            required: true,
            label: 'Data de devolução',
            section: 'Operação',
          },
        },
      },
    },
  },
  validations: [
    {
      rule: 'compare',
      left: 'completion_date',
      op: '>=',
      right: 'start_date',
      level: 'error',
      message: 'Data de conclusão anterior à de início',
    },
    {
      rule: 'range',
      field: 'cargo_weight',
      min: 0,
      max: 200000,
      level: 'warning',
      message: 'Peso de carga fora do intervalo usual',
    },
  ],
  photo_slots: [
    {
      id: 'draft_fwd',
      label: 'Calado de proa',
      aspect: '4:3',
      required: true,
      max: 1,
    },
    { id: 'holds', label: 'Porões', aspect: '16:9', min: 2, max: 6 },
  ],
};

function clone(): any {
  return structuredClone(validSpec);
}

describe('validateSpec — spec válido', () => {
  it('aceita o exemplo completo (PRD §8)', () => {
    const r = validateSpec(validSpec);
    expect(r.valid).toBe(true);
    if (r.valid) {
      const spec: ReportSpec = r.spec;
      expect(spec.report_type).toBe('on_off_hire');
    }
  });

  it('aceita um tipo sem variantes (variants: [])', () => {
    const s = clone();
    s.variants = [];
    delete s.source.by_variant;
    expect(validateSpec(s).valid).toBe(true);
  });
});

describe('validateSpec — specs inválidos (CA-001)', () => {
  const cases: { name: string; mutate: (s: any) => void }[] = [
    { name: 'sem report_type', mutate: (s) => delete s.report_type },
    { name: 'version = 0 (abaixo do mínimo)', mutate: (s) => (s.version = 0) },
    { name: 'version como string', mutate: (s) => (s.version = '1') },
    { name: 'variants não-array', mutate: (s) => (s.variants = 'on_hire') },
    { name: 'sem source', mutate: (s) => delete s.source },
    { name: 'source sem sheet', mutate: (s) => delete s.source.sheet },
    {
      name: 'fingerprint sem expect',
      mutate: (s) => delete s.source.fingerprint.expect,
    },
    {
      name: 'common.fields vazio',
      mutate: (s) => (s.source.common.fields = {}),
    },
    {
      name: 'campo sem cell',
      mutate: (s) => delete s.source.common.fields.vessel_name.cell,
    },
    {
      name: 'cell com padrão inválido',
      mutate: (s) => (s.source.common.fields.vessel_name.cell = 'b7'),
    },
    {
      name: 'tipo de campo inválido',
      mutate: (s) => (s.source.common.fields.vessel_name.type = 'texto'),
    },
    {
      name: 'date sem format',
      mutate: (s) => delete s.source.common.fields.survey_date.format,
    },
    {
      name: 'enum sem options',
      mutate: (s) => delete s.source.common.fields.op_kind.options,
    },
    {
      name: 'string com format (exclusivo de date)',
      mutate: (s) => (s.source.common.fields.vessel_name.format = 'DD/MM'),
    },
    {
      name: 'propriedade desconhecida no campo',
      mutate: (s) => (s.source.common.fields.vessel_name.foo = 1),
    },
    {
      name: 'range sem min/max',
      mutate: (s) => {
        delete s.validations[1].min;
        delete s.validations[1].max;
      },
    },
    {
      name: 'compare com operador inválido',
      mutate: (s) => (s.validations[0].op = '=>'),
    },
    {
      name: 'photo_slot com aspect inválido',
      mutate: (s) => (s.photo_slots[0].aspect = '4x3'),
    },
  ];

  for (const c of cases) {
    it(`rejeita: ${c.name}`, () => {
      const s = clone();
      c.mutate(s);
      const r = validateSpec(s);
      expect(r.valid).toBe(false);
      if (!r.valid) {
        expect(r.errors.length).toBeGreaterThan(0);
        expect(
          r.errors.every((e) => typeof e === 'string' && e.length > 0),
        ).toBe(true);
      }
    });
  }

  it('tem 10+ casos inválidos cobertos (aceite do PRD T-04)', () => {
    expect(cases.length).toBeGreaterThanOrEqual(10);
  });
});

describe('validateSpec — contrato v2 multi-aba (CA-008)', () => {
  /** Spec v2 mínimo válido (multi-aba). */
  function v2Spec(): any {
    return {
      contract: 2,
      report_type: 'draft_survey',
      version: 1,
      variants: ['loading', 'discharge'],
      source: {
        fingerprint: { sheet: 'Capa', cell: 'B2', expect: 'DRAFT SURVEY' },
        variant_source: {
          sheet: 'Capa',
          cell: 'L4',
          map: { Loading: 'loading', Discharge: 'discharge' },
        },
        ignore_sheets: ['LOD-LOP'],
        common: {
          fields: {
            vessel_name: {
              sheet: 'Capa',
              cell: 'C13',
              type: 'string',
              required: true,
              label: 'Nome do navio',
              section: 'Particulars do navio',
            },
            init_fwd_mean: {
              sheet: 'Inicial',
              cell: 'D10',
              type: 'number',
              decimals: 3,
              unit: 'm',
              label: 'AV (Fwd) médio',
              section: 'Calados — Inicial',
            },
          },
        },
        tables: [
          {
            id: 'init_draft_marks',
            label: 'Initial — Draft marks',
            sheet: 'Inicial',
            range: 'B8:H18',
            phase: 'initial',
            provisional: true,
          },
        ],
      },
    };
  }

  it('aceita o spec real do cliente (draft_survey.v1.json)', () => {
    const real = JSON.parse(readFileSync(REAL_SPEC_PATH, 'utf8'));
    const r = validateSpec(real);
    if (!r.valid) {
      // Falha → expõe os erros para diagnóstico rápido.
      expect(r.errors).toEqual([]);
    }
    expect(r.valid).toBe(true);
    if (r.valid) {
      expect(r.spec.contract).toBe(2);
      expect(r.spec.report_type).toBe('draft_survey');
    }
  });

  it('aceita um spec v2 mínimo (sheet por campo + variant_source + tables)', () => {
    expect(validateSpec(v2Spec()).valid).toBe(true);
  });

  it('rejeita v2 com campo sem sheet', () => {
    const s = v2Spec();
    delete s.source.common.fields.init_fwd_mean.sheet;
    const r = validateSpec(s);
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.some((e) => e.includes("precisa de 'sheet'"))).toBe(true);
  });

  it('rejeita v2 com fingerprint sem sheet', () => {
    const s = v2Spec();
    delete s.source.fingerprint.sheet;
    const r = validateSpec(s);
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.some((e) => e.includes('fingerprint.sheet'))).toBe(true);
  });

  it('rejeita variant_source apontando para variante ausente em variants', () => {
    const s = v2Spec();
    s.source.variant_source.map = { Loading: 'loading', Descarga: 'descarga' };
    const r = validateSpec(s);
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.some((e) => e.includes("'descarga'"))).toBe(true);
  });

  it('rejeita contract fora de [1,2]', () => {
    const s = v2Spec();
    s.contract = 3;
    expect(validateSpec(s).valid).toBe(false);
  });

  it('contrato v1 (sem contract) ainda exige source.sheet', () => {
    const s = v2Spec();
    delete s.contract;
    delete s.source.variant_source;
    delete s.source.tables;
    // sem source.sheet e sem contract → v1 inválido
    const r = validateSpec(s);
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.some((e) => e.includes("'source.sheet'"))).toBe(true);
  });
});
