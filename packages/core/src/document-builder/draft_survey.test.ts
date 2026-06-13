import { describe, it, expect } from 'vitest';
import { buildDraftSurvey } from './draft_survey';
import type { ReportSpec } from '../types';
import type { BuilderInput } from './types';

const spec: ReportSpec = {
  report_type: 'draft_survey',
  version: 1,
  variants: ['loading', 'discharge'],
  source: {
    sheet: 'DADOS',
    fingerprint: { cell: 'A1', expect: 'NAABSA-DRAFT' },
    common: {
      fields: {
        vessel_name: { cell: 'B4', type: 'string', required: true, label: 'Nome do navio', section: 'Identificação' },
        cargo_weight: { cell: 'B5', type: 'number', decimals: 0, label: 'Peso de carga (t)', section: 'Carga' },
        survey_date: { cell: 'B6', type: 'date', format: 'DD/MMM/YYYY', required: true, label: 'Data do survey', section: 'Survey' },
        clean: { cell: 'B7', type: 'boolean', label: 'Porões limpos', section: 'Survey' },
      },
    },
    by_variant: {
      loading: {
        fields: {
          load_port: { cell: 'B8', type: 'string', required: true, label: 'Porto de carregamento', section: 'Operação' },
        },
      },
      discharge: {
        fields: {
          disch_port: { cell: 'B8', type: 'string', required: true, label: 'Porto de descarga', section: 'Operação' },
        },
      },
    },
  },
  validations: [],
  photo_slots: [{ id: 'draft_fwd', label: 'Calado de proa', aspect: '4:3', required: true, max: 1 }],
};

const baseData: BuilderInput['data'] = {
  vessel_name: 'MV Naabsa Test',
  cargo_weight: 42000,
  survey_date: '2026-06-01',
  clean: true,
};

describe('buildDraftSurvey — CA-001', () => {
  it('retorna um doc TipTap válido para variante discharge', () => {
    const input: BuilderInput = {
      spec,
      variant: 'discharge',
      data: { ...baseData, disch_port: 'Santos' },
      photos: [],
    };
    const result = buildDraftSurvey(input);
    expect(result.type).toBe('doc');
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content.length).toBeGreaterThan(0);
  });

  it('snapshot — discharge (CA-001)', () => {
    const input: BuilderInput = {
      spec,
      variant: 'discharge',
      data: { ...baseData, disch_port: 'Santos' },
      photos: [{ slotId: 'draft_fwd', photoId: 'photo-1', src: 'https://cdn.example.com/photo.jpg' }],
    };
    expect(buildDraftSurvey(input)).toMatchSnapshot();
  });

  it('snapshot — loading (CA-001)', () => {
    const input: BuilderInput = {
      spec,
      variant: 'loading',
      data: { ...baseData, load_port: 'Paranaguá' },
      photos: [],
    };
    expect(buildDraftSurvey(input)).toMatchSnapshot();
  });

  it('inclui photoFrame do slot draft_fwd quando foto presente', () => {
    const input: BuilderInput = {
      spec,
      variant: 'discharge',
      data: { ...baseData, disch_port: 'Santos' },
      photos: [{ slotId: 'draft_fwd', photoId: 'photo-1', src: 'https://cdn.example.com/photo.jpg' }],
    };
    const result = buildDraftSurvey(input);
    const frames = result.content.filter((n) => n.type === 'photoFrame');
    expect(frames).toHaveLength(1);
    expect(frames[0]?.attrs?.['photoId']).toBe('photo-1');
    expect(frames[0]?.attrs?.['slotId']).toBe('draft_fwd');
  });

  it('photoFrame com src null quando slot sem foto', () => {
    const input: BuilderInput = {
      spec,
      variant: 'discharge',
      data: { ...baseData, disch_port: 'Vitória' },
      photos: [],
    };
    const result = buildDraftSurvey(input);
    const frame = result.content.find((n) => n.type === 'photoFrame');
    expect(frame?.attrs?.['src']).toBeNull();
    expect(frame?.attrs?.['photoId']).toBeNull();
  });

  it('variante loading inclui Porto de carregamento', () => {
    const input: BuilderInput = {
      spec,
      variant: 'loading',
      data: { ...baseData, load_port: 'Itajaí' },
      photos: [],
    };
    const result = buildDraftSurvey(input);
    const json = JSON.stringify(result);
    expect(json).toContain('load_port');
    expect(json).toContain('Porto de carregamento');
    expect(json).not.toContain('disch_port');
  });

  it('variante discharge inclui Porto de descarga', () => {
    const input: BuilderInput = {
      spec,
      variant: 'discharge',
      data: { ...baseData, disch_port: 'Santos' },
      photos: [],
    };
    const result = buildDraftSurvey(input);
    const json = JSON.stringify(result);
    expect(json).toContain('disch_port');
    expect(json).toContain('Porto de descarga');
    expect(json).not.toContain('load_port');
  });

  it('rejeita tipo incompatível', () => {
    const wrongSpec = { ...spec, report_type: 'rob' };
    expect(() => buildDraftSurvey({ spec: wrongSpec, variant: null, data: baseData, photos: [] }))
      .toThrow('incompatível');
  });

  it('rejeita variante desconhecida', () => {
    expect(() => buildDraftSurvey({ spec, variant: 'unknown_variant', data: baseData, photos: [] }))
      .toThrow('variante desconhecida');
  });
});
