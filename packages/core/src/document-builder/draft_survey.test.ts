import { describe, it, expect } from 'vitest';
import { buildDraftSurvey } from './draft_survey';
import type { ReportSpec } from '../types';
import type { BuilderInput } from './types';

const spec: ReportSpec = {
  report_type: 'draft_survey',
  version: 1,
  variants: ['loading', 'discharge'],
  source: {
    sheet: 'Capa',
    fingerprint: { cell: 'B2', expect: 'DRAFT SURVEY', sheet: 'Capa' },
    common: {
      fields: {
        vessel_name: { cell: 'C13', type: 'string', required: true, label: 'Navio', section: 'Identificação' },
        flag: { cell: 'C14', type: 'string', label: 'Bandeira', section: 'Ship Particulars' },
        imo: { cell: 'C17', type: 'string', label: 'IMO', section: 'Ship Particulars' },
        port: { cell: 'C5', type: 'string', required: true, label: 'Porto', section: 'Identificação' },
        final_date: { cell: 'L9', type: 'date', format: 'DD/MMM/YYYY', label: 'Data Final', section: 'Survey', sheet: 'Capa' },
        client: { cell: 'C33', type: 'string', label: 'Cliente', section: 'Identificação' },
        operator: { cell: 'C34', type: 'string', label: 'Operador', section: 'Identificação' },
        captain: { cell: 'C28', type: 'string', label: 'Comandante', section: 'Identificação' },
        chief_officer: { cell: 'C29', type: 'string', label: 'Imediato', section: 'Identificação' },
        terminal: { cell: 'C6', type: 'string', label: 'Terminal', section: 'Identificação' },
        cargo: { cell: 'C7', type: 'string', label: 'Carga', section: 'Carga' },
        discharging_port: { cell: 'C8', type: 'string', label: 'Porto de descarga', section: 'Carga' },
        berthing_side: { cell: 'C31', type: 'enum', options: ['Port Side', 'Starboard'], label: 'Bordo', section: 'Identificação' },
        initial_date: { cell: 'L7', type: 'date', format: 'DD/MMM/YYYY', label: 'Data Inicial', section: 'Survey', sheet: 'Capa' },
        initial_start: { cell: 'M7', type: 'time', label: 'Hora Inicial Início', section: 'Survey', sheet: 'Capa' },
        initial_end: { cell: 'N7', type: 'time', label: 'Hora Inicial Fim', section: 'Survey', sheet: 'Capa' },
        init_fwd_mean: { cell: 'D10', type: 'number', decimals: 3, label: 'Médias Proa Inicial', section: 'Survey', sheet: 'Capa' },
        init_fwd_corr: { cell: 'E10', type: 'number', decimals: 4, label: 'Proa Corrigida Inicial', section: 'Survey', sheet: 'Capa' },
        init_mid_mean: { cell: 'D11', type: 'number', decimals: 3, label: 'Médias Meio Inicial', section: 'Survey', sheet: 'Capa' },
        init_mid_corr: { cell: 'E11', type: 'number', decimals: 4, label: 'Meio Corrigido Inicial', section: 'Survey', sheet: 'Capa' },
        init_aft_mean: { cell: 'D12', type: 'number', decimals: 3, label: 'Médias Popa Inicial', section: 'Survey', sheet: 'Capa' },
        init_aft_corr: { cell: 'E12', type: 'number', decimals: 4, label: 'Popa Corrigida Inicial', section: 'Survey', sheet: 'Capa' },
        init_trim_obs: { cell: 'F10', type: 'number', decimals: 4, label: 'Trim Obs Inicial', section: 'Survey', sheet: 'Capa' },
        init_trim_corr: { cell: 'G10', type: 'number', decimals: 4, label: 'Trim Corrigido Inicial', section: 'Survey', sheet: 'Capa' },
        fin_fwd_mean: { cell: 'D13', type: 'number', decimals: 3, label: 'Médias Proa Final', section: 'Survey', sheet: 'Capa' },
        fin_fwd_corr: { cell: 'E13', type: 'number', decimals: 4, label: 'Proa Corrigida Final', section: 'Survey', sheet: 'Capa' },
        fin_mid_mean: { cell: 'D14', type: 'number', decimals: 3, label: 'Médias Meio Final', section: 'Survey', sheet: 'Capa' },
        fin_mid_corr: { cell: 'E14', type: 'number', decimals: 4, label: 'Meio Corrigido Final', section: 'Survey', sheet: 'Capa' },
        fin_aft_mean: { cell: 'D15', type: 'number', decimals: 3, label: 'Médias Popa Final', section: 'Survey', sheet: 'Capa' },
        fin_aft_corr: { cell: 'E15', type: 'number', decimals: 4, label: 'Popa Corrigida Final', section: 'Survey', sheet: 'Capa' },
        fin_trim_obs: { cell: 'F13', type: 'number', decimals: 4, label: 'Trim Obs Final', section: 'Survey', sheet: 'Capa' },
        fin_trim_corr: { cell: 'G13', type: 'number', decimals: 4, label: 'Trim Corrigido Final', section: 'Survey', sheet: 'Capa' },
        final_start: { cell: 'M9', type: 'time', label: 'Hora Final Início', section: 'Survey', sheet: 'Capa' },
        final_end: { cell: 'N9', type: 'time', label: 'Hora Final Fim', section: 'Survey', sheet: 'Capa' },
      },
    },
    by_variant: {},
  },
  validations: [],
  photo_slots: [
    { id: 'photos_initial', label: 'Fotos — Inicial', aspect: '4:3', required: true, min: 1 },
    { id: 'photos_intermediate', label: 'Fotos — Intermediário', aspect: '4:3', required: false },
    { id: 'photos_final', label: 'Fotos — Final', aspect: '4:3', required: true, min: 1 },
  ],
};

const baseData: BuilderInput['data'] = {
  vessel_name: 'MV Perseus I',
  flag: 'Malta',
  imo: '9876543',
  port: 'Santos',
  final_date: '24/Jun/2026',
  client: 'Cargill',
  operator: 'Santos Brasil',
  captain: 'J. Silva',
  chief_officer: 'A. Pereira',
  terminal: 'T-Granéis',
  cargo: 'Soybean',
  discharging_port: 'Rotterdam',
  berthing_side: 'Starboard',
  initial_date: '24/Jun/2026',
  initial_start: '08:00',
  initial_end: '10:30',
  init_fwd_mean: 4.78,
  init_fwd_corr: 4.7802,
  init_mid_mean: 5.12,
  init_mid_corr: 5.1198,
  init_aft_mean: 5.44,
  init_aft_corr: 5.4401,
  init_trim_obs: -0.66,
  init_trim_corr: -0.6599,
  fin_fwd_mean: 4.55,
  fin_fwd_corr: 4.5503,
  fin_mid_mean: 4.97,
  fin_mid_corr: 4.9701,
  fin_aft_mean: 5.38,
  fin_aft_corr: 5.3800,
  fin_trim_obs: -0.83,
  fin_trim_corr: -0.8300,
  final_start: '14:00',
  final_end: '16:30',
};

describe('buildDraftSurvey — CA-001', () => {
  it('retorna um doc TipTap válido para variante discharge', () => {
    const input: BuilderInput = {
      spec,
      variant: 'discharge',
      data: baseData,
      tables: {},
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
      data: baseData,
      tables: {},
      photos: [{ slotId: 'photos_initial', photoId: 'photo-1', src: 'https://cdn.example.com/photo.jpg' }],
    };
    expect(buildDraftSurvey(input)).toMatchSnapshot();
  });

  it('snapshot — loading (CA-001)', () => {
    const input: BuilderInput = {
      spec,
      variant: 'loading',
      data: baseData,
      tables: {},
      photos: [],
    };
    expect(buildDraftSurvey(input)).toMatchSnapshot();
  });

  it('inclui photoFrame do slot photos_initial quando foto presente', () => {
    const input: BuilderInput = {
      spec,
      variant: 'discharge',
      data: baseData,
      tables: {},
      photos: [{ slotId: 'photos_initial', photoId: 'photo-1', src: 'https://cdn.example.com/photo.jpg' }],
    };
    const result = buildDraftSurvey(input);
    const frames = result.content.filter((n) => n.type === 'photoFrame');
    const initialFrame = frames.find((n) => n.attrs?.['slotId'] === 'photos_initial');
    expect(initialFrame).toBeDefined();
    expect(initialFrame?.attrs?.['photoId']).toBe('photo-1');
  });

  it('photoFrame com src null quando slot sem foto', () => {
    const input: BuilderInput = {
      spec,
      variant: 'discharge',
      data: baseData,
      tables: {},
      photos: [],
    };
    const result = buildDraftSurvey(input);
    const frame = result.content.find((n) => n.type === 'photoFrame');
    expect(frame?.attrs?.['src']).toBeNull();
    expect(frame?.attrs?.['photoId']).toBeNull();
  });

  it('variante discharge contém "Discharge" e "loaded in" no Background', () => {
    const input: BuilderInput = {
      spec,
      variant: 'discharge',
      data: baseData,
      tables: {},
      photos: [],
    };
    const json = JSON.stringify(buildDraftSurvey(input));
    expect(json).toContain('Discharge Draft Survey');
    expect(json).toContain('loaded in');
    expect(json).not.toContain('bound to');
  });

  it('variante loading contém "Loading" e "bound to" no Background', () => {
    const input: BuilderInput = {
      spec,
      variant: 'loading',
      data: baseData,
      tables: {},
      photos: [],
    };
    const json = JSON.stringify(buildDraftSurvey(input));
    expect(json).toContain('Loading Draft Survey');
    expect(json).toContain('bound to');
    expect(json).not.toContain('loaded in');
  });

  it('Intermediate não aparece quando intermediate_date ausente', () => {
    const input: BuilderInput = {
      spec,
      variant: 'discharge',
      data: { ...baseData, intermediate_date: null },
      tables: {},
      photos: [],
    };
    const json = JSON.stringify(buildDraftSurvey(input));
    expect(json).not.toContain('Intermediate Draft Survey');
    expect(json).not.toContain('photos_intermediate');
  });

  it('Intermediate aparece quando intermediate_date presente', () => {
    const input: BuilderInput = {
      spec,
      variant: 'discharge',
      data: {
        ...baseData,
        intermediate_date: '24/Jun/2026',
        intermediate_start: '11:00',
        intermediate_end: '13:00',
        int_fwd_mean: 4.65,
        int_fwd_corr: 4.6502,
        int_mid_mean: 5.00,
        int_mid_corr: 5.0001,
        int_aft_mean: 5.40,
        int_aft_corr: 5.4000,
        int_trim_obs: -0.75,
        int_trim_corr: -0.7501,
      },
      tables: {},
      photos: [
        { slotId: 'photos_intermediate', photoId: 'photo-mid', src: 'https://cdn.example.com/mid.jpg' },
      ],
    };
    const result = buildDraftSurvey(input);
    const json = JSON.stringify(result);
    expect(json).toContain('Intermediate Draft Survey');
    expect(json).toContain('photos_intermediate');
  });

  it('rejeita tipo incompatível', () => {
    const wrongSpec = { ...spec, report_type: 'rob' };
    expect(() => buildDraftSurvey({ spec: wrongSpec, variant: null, data: baseData, tables: {}, photos: [] }))
      .toThrow('incompatível');
  });

  it('rejeita variante desconhecida', () => {
    expect(() => buildDraftSurvey({ spec, variant: 'unknown_variant', data: baseData, tables: {}, photos: [] }))
      .toThrow('variante desconhecida');
  });
});
