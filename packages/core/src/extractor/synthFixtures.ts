/**
 * Fixtures sintéticas para os testes do motor (T-006). Gera workbooks ExcelJS
 * in-memory a partir de um layout — mais determinístico e rápido que arquivos
 * .xlsx em disco. A fixture com a planilha REAL do cliente entra na T-012.
 */
import ExcelJS from 'exceljs';
import type { ReportSpec } from '../types';

/** Spec sintético de Draft Survey (com variantes loading/discharge). */
export const sampleSpec: ReportSpec = {
  report_type: 'draft_survey',
  version: 1,
  variants: ['loading', 'discharge'],
  source: {
    sheet: 'DADOS',
    fingerprint: { cell: 'A1', expect: 'NAABSA-DRAFT' },
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
          cell: 'B5',
          type: 'number',
          decimals: 0,
          label: 'Peso de carga (t)',
          section: 'Carga',
        },
        survey_date: {
          cell: 'B6',
          type: 'date',
          format: 'DD/MMM/YYYY',
          required: true,
          label: 'Data do survey',
          section: 'Survey',
        },
        clean: {
          cell: 'B7',
          type: 'boolean',
          label: 'Porões limpos',
          section: 'Survey',
        },
      },
    },
    by_variant: {
      loading: {
        fields: {
          load_port: {
            cell: 'B8',
            type: 'string',
            required: true,
            label: 'Porto de carregamento',
            section: 'Operação',
          },
        },
      },
      discharge: {
        fields: {
          disch_port: {
            cell: 'B8',
            type: 'string',
            required: true,
            label: 'Porto de descarga',
            section: 'Operação',
          },
        },
      },
    },
  },
  validations: [
    {
      rule: 'range',
      field: 'cargo_weight',
      min: 0,
      max: 200000,
      level: 'warning',
      message: 'Peso de carga fora do intervalo usual.',
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
  ],
};

export interface BuildOpts {
  sheet?: string;
  /** Valor da célula de fingerprint (A1). */
  fingerprint?: string;
  /** Endereço da célula → valor cru. */
  cells?: Record<string, ExcelJS.CellValue>;
}

/** Monta um workbook com o fingerprint e as células informadas. */
export function buildWorkbook(opts: BuildOpts = {}): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(opts.sheet ?? 'DADOS');
  ws.getCell('A1').value = opts.fingerprint ?? 'NAABSA-DRAFT';
  for (const [addr, val] of Object.entries(opts.cells ?? {})) {
    ws.getCell(addr).value = val;
  }
  return wb;
}

/** Workbook completo e válido (variante discharge) — caminho feliz. */
export function buildCompleteWorkbook(): ExcelJS.Workbook {
  return buildWorkbook({
    cells: {
      B4: 'MV Cabo Frio',
      B5: 208450,
      B6: new Date(Date.UTC(2026, 5, 6)),
      B7: 'sim',
      B8: 'Tubarão',
    },
  });
}

// ── Contrato v2 (multi-aba) ──────────────────────────────────────────────────

/** Spec v2 mínimo (multi-aba) espelhando o desenho do Draft Survey real. */
export const sampleSpecV2: ReportSpec = {
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
        range: 'B8:H12',
        phase: 'initial',
        provisional: true,
      },
    ],
  },
};

export interface BuildV2Opts {
  /** Valor da célula de tipo de atendimento (Capa!L4). */
  kind?: string;
  /** Valor do fingerprint (Capa!B2). */
  fingerprint?: string;
  /** Células da aba Capa. */
  capa?: Record<string, ExcelJS.CellValue>;
  /** Células da aba Inicial. */
  inicial?: Record<string, ExcelJS.CellValue>;
  /** Omite a aba Inicial (testa aba ausente). */
  omitInicial?: boolean;
}

/** Workbook v2 com abas Capa + Inicial. */
export function buildV2Workbook(opts: BuildV2Opts = {}): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const capa = wb.addWorksheet('Capa');
  capa.getCell('B2').value = opts.fingerprint ?? 'DRAFT SURVEY';
  capa.getCell('L4').value = opts.kind ?? 'Loading';
  capa.getCell('C13').value = 'HG ANTWERP';
  for (const [addr, val] of Object.entries(opts.capa ?? {})) {
    capa.getCell(addr).value = val;
  }
  if (!opts.omitInicial) {
    const ini = wb.addWorksheet('Inicial');
    ini.getCell('D10').value = 4.78;
    for (const [addr, val] of Object.entries(opts.inicial ?? {})) {
      ini.getCell(addr).value = val;
    }
  }
  return wb;
}
