import { describe, expect, it } from 'vitest';
import type { NumberFieldDef, StringFieldDef } from './types';
import {
  formatNumberWithDecimals,
  inferExcelDisplayDecimals,
  resolveDisplayDecimals,
} from './number-format';

const base = { cell: 'B1', label: 'DWT', section: 'Carga' } as const;

function numberField(decimals?: number): NumberFieldDef {
  return { ...base, type: 'number', decimals };
}

describe('inferExcelDisplayDecimals', () => {
  it.each([
    ['0', 81, 0],
    ['0.0', 81, 1],
    ['#,##0.00', 81, 2],
    ['#,##0.000;[Red]-#,##0.000', -81, 3],
    ['0.##', 81, 0],
    ['0.##', 81.2, 1],
    ['0.##', 81.23, 2],
    ['General', 81, undefined],
  ])('infere %s para %s', (numFmt, value, expected) => {
    expect(inferExcelDisplayDecimals(numFmt, value)).toBe(expected);
  });

  it('ignora literais, escapes e diretivas ao interpretar a seção aplicável', () => {
    expect(inferExcelDisplayDecimals('"USD" 0.00\\x;[Red]-0.000', -81)).toBe(3);
  });

  it('rejeita formatos com condições numéricas para usar o fallback do spec', () => {
    expect(
      inferExcelDisplayDecimals('[<=100]0.00;[>100]0.000', 150),
    ).toBeUndefined();
  });

  it('aplica vírgulas finais de escala antes de avaliar casas opcionais', () => {
    expect(inferExcelDisplayDecimals('0.##,,', 1_230_000)).toBe(2);
  });

  it.each([
    ['0.' + '0'.repeat(101), 81, undefined],
    [undefined, 81, undefined],
  ])('não infere formato inválido %s', (numFmt, value, expected) => {
    expect(inferExcelDisplayDecimals(numFmt, value)).toBe(expected);
  });
});

describe('resolveDisplayDecimals', () => {
  it('resolve operador antes de Excel e spec', () => {
    expect(
      resolveDisplayDecimals(
        'dwt',
        numberField(3),
        { dwt: 2 },
        { dwt: 1 },
        { dwt: 81 },
      ),
    ).toBe(1);
  });

  it('ignora metadado do operador sem override numérico ativo', () => {
    expect(
      resolveDisplayDecimals('dwt', numberField(3), { dwt: 2 }, { dwt: 1 }, {}),
    ).toBe(2);
  });

  it('usa spec e depois representação padrão como fallbacks', () => {
    expect(resolveDisplayDecimals('dwt', numberField(3), {}, {}, {})).toBe(3);
    expect(
      resolveDisplayDecimals('dwt', numberField(), {}, {}, {}),
    ).toBeUndefined();
  });

  it('não resolve precisão para campo não numérico', () => {
    const field: StringFieldDef = { ...base, type: 'string' };
    expect(
      resolveDisplayDecimals('dwt', field, { dwt: 2 }, { dwt: 1 }, { dwt: 81 }),
    ).toBeUndefined();
  });
});

describe('formatNumberWithDecimals', () => {
  it.each([
    [81, 0, false, '81'],
    [81, 3, false, '81.000'],
    [1234.5, 2, true, '1,234.50'],
    [-1234.5, 1, true, '-1,234.5'],
    [81.25, undefined, false, '81.25'],
  ] as const)(
    'formata %s com precisão %s e grouped=%s',
    (value, decimals, grouped, expected) => {
      expect(formatNumberWithDecimals(value, decimals, grouped)).toBe(expected);
    },
  );
});
