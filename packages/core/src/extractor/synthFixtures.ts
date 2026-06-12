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
