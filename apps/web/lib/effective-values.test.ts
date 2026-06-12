import { describe, it, expect } from 'vitest';
import { groupBySectionOrdered } from './effective-values';
import type { ReportSpec } from '@naabsa/core';

const SPEC: ReportSpec = {
  report_type: 'test',
  version: 1,
  variants: [],
  source: {
    sheet: 'Dados',
    fingerprint: { cell: 'A1', expect: 'TEST' },
    common: {
      fields: {
        data_survey: {
          type: 'date',
          cell: 'B7',
          label: 'Data do Survey',
          section: 'Identificação',
          required: true,
          format: 'DD/MMM/YYYY',
        },
        navio: {
          type: 'string',
          cell: 'C5',
          label: 'Navio',
          section: 'Identificação',
          required: true,
        },
        calado: {
          type: 'number',
          cell: 'D10',
          label: 'Calado',
          section: 'Medições',
          decimals: 2,
        },
      },
    },
  },
};

describe('groupBySectionOrdered', () => {
  it('agrupa campos por seção na ordem do spec', () => {
    const sections = groupBySectionOrdered(SPEC, null, {}, null);
    expect(sections).toHaveLength(2);
    expect(sections[0]!.section).toBe('Identificação');
    expect(sections[1]!.section).toBe('Medições');
    expect(sections[0]!.fields.map((f) => f.name)).toEqual([
      'data_survey',
      'navio',
    ]);
  });

  it('valor efetivo = extracted quando sem override', () => {
    const sections = groupBySectionOrdered(
      SPEC,
      null,
      { data_survey: '2025-01-15', navio: 'MV Test' },
      null,
    );
    const id = sections[0]!.fields;
    expect(id[0]!.value).toBe('2025-01-15');
    expect(id[0]!.isOverride).toBe(false);
    expect(id[1]!.value).toBe('MV Test');
    expect(id[1]!.isOverride).toBe(false);
  });

  it('override prevalece sobre extracted e marca isOverride=true', () => {
    const sections = groupBySectionOrdered(
      SPEC,
      null,
      { data_survey: '2025-01-15', navio: 'MV Test' },
      { data_survey: '2025-06-01' },
    );
    const id = sections[0]!.fields;
    expect(id[0]!.value).toBe('2025-06-01');
    expect(id[0]!.isOverride).toBe(true);
    // navio sem override
    expect(id[1]!.value).toBe('MV Test');
    expect(id[1]!.isOverride).toBe(false);
  });

  it('campo sem valor retorna null', () => {
    const sections = groupBySectionOrdered(SPEC, null, {}, null);
    expect(sections[0]!.fields[0]!.value).toBeNull();
  });

  it('overrides={} vazio não marca isOverride', () => {
    const sections = groupBySectionOrdered(
      SPEC,
      null,
      { navio: 'X' },
      {},
    );
    expect(sections[0]!.fields[1]!.isOverride).toBe(false);
  });
});
