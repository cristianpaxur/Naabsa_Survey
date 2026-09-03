/**
 * Tabela "Draft details" completa — reproduz o layout do recorte padrão
 * (Density Correction / Trim / List / Deflection / Heel / Draft Survey by Trim
 * corr / Displacement / LCF TPC MTC / Ballast / Fuel / ROB / SF Calculation /
 * Total Deadrise / Final Dsp / Final Draft).
 *
 * Tabela renderizada VAZIA por design — o operador preenche manualmente
 * no Collabora (essa tabela não vem da planilha).
 *
 * IMPORTANTE: este helper é consumido por buildDocx.ts (draft_survey) E
 * buildDocxMsc.ts (MSC) — fica em arquivo separado intencionalmente para
 * evitar duplicar ~200 linhas de layout idêntico.
 */
import {
  Table, TableRow, TableCell, Paragraph, TextRun, AlignmentType, BorderStyle,
  WidthType, VerticalAlign, ShadingType,
} from 'docx';
import type { FieldValue } from '@naabsa/core';

const SANS = 'Calibri';

// Cores do print (estimadas; operador ajusta no Collabora se precisar).
const HDR_BG = 'D9E2F3';   // azul claro do header de seção
const LABEL_BG = 'F2F2F2'; // cinza claro para rótulos
const GROUP_BG = '002060'; // navy para o nome do grupo

const SINGLE = (color = '808080') => ({
  style: BorderStyle.SINGLE, size: 4, color,
} as const);

const allBorders = (color = '808080') => ({
  top: SINGLE(color), bottom: SINGLE(color), left: SINGLE(color), right: SINGLE(color),
  insideHorizontal: SINGLE(color), insideVertical: SINGLE(color),
});

const run = (text: string, opts: { bold?: boolean; size?: number; color?: string } = {}) =>
  new TextRun({ text, bold: opts.bold, size: opts.size ?? 18, color: opts.color, font: SANS });

/** Soma larguras de COLS no intervalo [from, to) (inclusivo/exclusivo). */
function sum(COLS: readonly number[], from: number, to: number): number {
  let n = 0;
  for (let i = from; i < to; i++) n += COLS[i]!;
  return n;
}

/** Célula de label (esquerda) — rótulo em negrito, fundo cinza claro. */
function labelCell(t: string, w: number, opts: { span?: number; bg?: string } = {}): TableCell {
  return new TableCell({
    width: { size: w, type: WidthType.DXA },
    columnSpan: opts.span,
    borders: allBorders(),
    margins: { top: 20, bottom: 20, left: 70, right: 70 },
    verticalAlign: VerticalAlign.CENTER,
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: opts.bg ?? LABEL_BG },
    children: [new Paragraph({ spacing: { after: 0 }, children: [run(t, { bold: true, size: 17 })] })],
  });
}

/** Célula de valor (direita) — vazia por padrão (operador preenche no Collabora). */
function valueCell(w: number, opts: { span?: number; bold?: boolean } = {}): TableCell {
  return new TableCell({
    width: { size: w, type: WidthType.DXA },
    columnSpan: opts.span,
    borders: allBorders(),
    margins: { top: 20, bottom: 20, left: 70, right: 70 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 0 }, children: [run('', { bold: opts.bold, size: 17 })] })],
  });
}

/** Célula de header de seção (azul navy, texto branco em negrito). */
function groupCell(t: string, w: number, opts: { span?: number } = {}): TableCell {
  return new TableCell({
    width: { size: w, type: WidthType.DXA },
    columnSpan: opts.span,
    borders: allBorders(),
    margins: { top: 30, bottom: 30, left: 70, right: 70 },
    verticalAlign: VerticalAlign.CENTER,
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: GROUP_BG },
    children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [run(t, { bold: true, size: 18, color: 'FFFFFF' })] })],
  });
}

/** Linha de header (subcabeçalho azul claro). */
function subHeaderCell(t: string, w: number): TableCell {
  return new TableCell({
    width: { size: w, type: WidthType.DXA },
    borders: allBorders(),
    margins: { top: 20, bottom: 20, left: 70, right: 70 },
    verticalAlign: VerticalAlign.CENTER,
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: HDR_BG },
    children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [run(t, { bold: true, size: 17 })] })],
  });
}

/**
 * Tabela completa do "Draft details" — todas as linhas do print.
 * Layout é uma grade com 8 colunas fixas (twips). Largura total ≈ 9860.
 */
export function draftDetailsTable(): Table {
  // 8 colunas; soma = 1100+1100+1100+1100+1100+1100+1100+1260 = 9860.
  const COLS = [1100, 1100, 1100, 1100, 1100, 1100, 1100, 1260] as const;
  const TOTAL = COLS.reduce((a, b) => a + b, 0);
  const row = (cells: TableCell[]) => new TableRow({ children: cells, cantSplit: true });

  const rows: TableRow[] = [];

  // ── Bloco 1: DENSITY / DRAFT CORRECTION ──
  rows.push(row([
    groupCell('DENSITY / DRAFT CORRECTION', sum(COLS, 0, 6), { span: 6 }),
    groupCell('TRIM', sum(COLS, 6, 8), { span: 2 }),
  ]));
  rows.push(row([
    subHeaderCell('', COLS[0]!),
    subHeaderCell('DENSITY', COLS[1]!),
    subHeaderCell('FWD', COLS[2]!),
    subHeaderCell('MID', COLS[3]!),
    subHeaderCell('AFT', COLS[4]!),
    subHeaderCell('LIST', COLS[5]!),
    subHeaderCell('TRIM obs', COLS[6]!),
    subHeaderCell('TRIM corr', COLS[7]!),
  ]));
  rows.push(row([
    labelCell('Draft Mark', COLS[0]!),
    valueCell(COLS[1]!), valueCell(COLS[2]!), valueCell(COLS[3]!), valueCell(COLS[4]!),
    valueCell(COLS[5]!), valueCell(COLS[6]!), valueCell(COLS[7]!),
  ]));

  // ── Bloco 2: DEFLECTION / MEAN CORRECTED / OBS ──
  rows.push(row([
    groupCell('DEFLECTION', sum(COLS, 0, 5), { span: 5 }),
    groupCell('MEAN CORRECTED', sum(COLS, 5, 7), { span: 2 }),
    groupCell('OBS', COLS[7]!),
  ]));
  rows.push(row([
    labelCell('Mean', COLS[0]!),
    valueCell(COLS[1]!), valueCell(COLS[2]!), valueCell(COLS[3]!), valueCell(COLS[4]!),
    valueCell(COLS[5]!), valueCell(COLS[6]!), valueCell(COLS[7]!),
  ]));

  // ── Bloco 3: HEEL BY TRIM CORR / LIST CORR / DRAFT CORR ──
  rows.push(row([
    groupCell('HEEL BY TRIM CORR', sum(COLS, 0, 5), { span: 5 }),
    groupCell('LIST CORR', sum(COLS, 5, 6), { span: 1 }),
    groupCell('DRAFT CORR', sum(COLS, 6, 8), { span: 2 }),
  ]));
  for (const lbl of ['FWD', 'MID', 'AFT']) {
    rows.push(row([
      labelCell(lbl, COLS[0]!),
      valueCell(COLS[1]!), valueCell(COLS[2]!), valueCell(COLS[3]!), valueCell(COLS[4]!),
      valueCell(COLS[5]!), valueCell(COLS[6]!), valueCell(COLS[7]!),
    ]));
  }

  // ── Bloco 4: DRAFT SURVEY BY TRIM CORR ──
  rows.push(row([
    groupCell('DRAFT SURVEY BY TRIM CORR', sum(COLS, 0, 5), { span: 5 }),
    groupCell('TRIM DISP', COLS[5]!),
    groupCell('LIST CORR', COLS[6]!),
    groupCell('DRAFT CORR', COLS[7]!),
  ]));
  for (const lbl of ['FWD', 'MID', 'AFT']) {
    rows.push(row([
      labelCell(lbl, COLS[0]!),
      valueCell(COLS[1]!), valueCell(COLS[2]!), valueCell(COLS[3]!), valueCell(COLS[4]!),
      valueCell(COLS[5]!), valueCell(COLS[6]!), valueCell(COLS[7]!),
    ]));
  }

  // ── Bloco 5: DISPLACEMENT / LCF / TPC / MTC ──
  rows.push(row([
    groupCell('DISPLACEMENT', sum(COLS, 0, 5), { span: 5 }),
    groupCell('LCF', COLS[5]!),
    groupCell('TPC', COLS[6]!),
    groupCell('MTC', COLS[7]!),
  ]));
  for (const lbl of ['Disp (mt)', 'MT (cm)', 'D.P (cm)', 'Draft Corr']) {
    rows.push(row([
      labelCell(lbl, COLS[0]!),
      valueCell(COLS[1]!), valueCell(COLS[2]!), valueCell(COLS[3]!), valueCell(COLS[4]!),
      valueCell(COLS[5]!), valueCell(COLS[6]!), valueCell(COLS[7]!),
    ]));
  }

  // ── Bloco 6: BALLAST ──
  rows.push(row([groupCell('BALLAST', TOTAL, { span: 8 })]));
  for (const lbl of ['D.B. (mt)', 'SB (mt)', 'FP (mt)', 'AP (mt)', 'TPL (mt)', 'F.B. (mt)']) {
    rows.push(row([
      labelCell(lbl, COLS[0]!),
      valueCell(COLS[1]!), valueCell(COLS[2]!), valueCell(COLS[3]!), valueCell(COLS[4]!),
      valueCell(COLS[5]!), valueCell(COLS[6]!), valueCell(COLS[7]!),
    ]));
  }

  // ── Bloco 7: FUEL ──
  rows.push(row([groupCell('FUEL', TOTAL, { span: 8 })]));
  for (const lbl of ['HSFO (mt)', 'VLSFO (mt)', 'ULSFO (mt)', 'LSFO (mt)', 'MGO (mt)', 'LSMGO (mt)', 'BIO (mt)']) {
    rows.push(row([
      labelCell(lbl, COLS[0]!),
      valueCell(COLS[1]!), valueCell(COLS[2]!), valueCell(COLS[3]!), valueCell(COLS[4]!),
      valueCell(COLS[5]!), valueCell(COLS[6]!), valueCell(COLS[7]!),
    ]));
  }

  // ── Bloco 8: ROB ──
  rows.push(row([groupCell('ROB', TOTAL, { span: 8 })]));
  for (const lbl of ['Bunker (mt)', 'ROB (mt)', 'SF (%)']) {
    rows.push(row([
      labelCell(lbl, COLS[0]!),
      valueCell(COLS[1]!), valueCell(COLS[2]!), valueCell(COLS[3]!), valueCell(COLS[4]!),
      valueCell(COLS[5]!), valueCell(COLS[6]!), valueCell(COLS[7]!),
    ]));
  }

  // ── Bloco 9: SF CALCULATION ──
  rows.push(row([groupCell('SF CALCULATION', TOTAL, { span: 8 })]));
  for (const lbl of ['BEG', 'MID', 'END', 'Used (mt)', 'Avg (mt)', 'SF (%)']) {
    rows.push(row([
      labelCell(lbl, COLS[0]!),
      valueCell(COLS[1]!), valueCell(COLS[2]!), valueCell(COLS[3]!), valueCell(COLS[4]!),
      valueCell(COLS[5]!), valueCell(COLS[6]!), valueCell(COLS[7]!),
    ]));
  }

  // ── Bloco 10: TOTAL DEADRISE / FINAL DSP / FINAL DRAFT ──
  rows.push(row([
    labelCell('TOTAL DEADRISE', sum(COLS, 0, 5), { span: 5 }),
    valueCell(COLS[5]!, { bold: true }),
    labelCell('FINAL DSP', COLS[6]!),
    valueCell(COLS[7]!, { bold: true }),
  ]));
  rows.push(row([
    labelCell('FINAL DRAFT', sum(COLS, 0, 5), { span: 5 }),
    valueCell(COLS[5]!, { bold: true }),
    labelCell('DISPLACEMENT', COLS[6]!),
    valueCell(COLS[7]!, { bold: true }),
  ]));

  return new Table({
    width: { size: TOTAL, type: WidthType.DXA },
    columnWidths: [...COLS],
    borders: allBorders(),
    rows,
  });
}

/** Re-export do tipo FieldValue para evitar import circular no consumidor. */
export type { FieldValue };
