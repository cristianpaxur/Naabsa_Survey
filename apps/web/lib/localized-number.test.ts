import { describe, expect, it } from 'vitest';
import { formatNumberDraft, parseLocalizedNumber, parseLocalizedNumberDraft, numberStateAfterSave } from './localized-number';

describe('numberStateAfterSave', () => {
  it('confirma 81.00 com as duas casas salvas mesmo sem mudar o número', () => {
    expect(numberStateAfterSave({ value: 81, displayDecimals: 2, isOverride: true })).toEqual({
      value: 81, displayDecimals: 2, isOverride: true, draft: '81.00',
    });
  });

  it('limpar override recompõe valor e precisão Excel retornados pelo servidor', () => {
    expect(numberStateAfterSave({ value: 80, displayDecimals: 3, isOverride: false })).toEqual({
      value: 80, displayDecimals: 3, isOverride: false, draft: '80.000',
    });
  });

  it('não confirma estado local para resposta sem savedField', () => {
    expect(numberStateAfterSave(undefined)).toBeNull();
  });
});

describe('parseLocalizedNumberDraft', () => {
  it.each([
    ['81', { value: 81, decimals: 0 }],
    ['81.0', { value: 81, decimals: 1 }],
    ['81.00', { value: 81, decimals: 2 }],
    ['1.234,500', { value: 1234.5, decimals: 3 }],
    ['1,234.500', { value: 1234.5, decimals: 3 }],
    [' -0,250 ', { value: -0.25, decimals: 3 }],
    ['', { value: null }],
    ['  ', { value: null }],
    ['abc', null],
    ['1..2', null],
  ])('preserva valor e precisão de %s', (raw, expected) => {
    expect(parseLocalizedNumberDraft(raw)).toEqual(expected);
  });

  it('aceita 100 casas e rejeita 101 sem truncar a intenção digitada', () => {
    expect(parseLocalizedNumberDraft(`1.${'0'.repeat(100)}`)).toEqual({ value: 1, decimals: 100 });
    expect(parseLocalizedNumberDraft(`1.${'0'.repeat(101)}`)).toBeNull();
  });
});

describe('parseLocalizedNumber', () => {
  it.each([
    ['280,54', 280.54],
    ['280.54', 280.54],
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    [' 1 234,56 ', 1234.56],
    ['-0,25', -0.25],
  ])('accepts %s', (raw, expected) => {
    expect(parseLocalizedNumber(raw)).toBe(expected);
  });

  it('keeps an empty value empty and rejects invalid entries', () => {
    expect(parseLocalizedNumber('')).toBeNull();
    expect(parseLocalizedNumber('280,5m')).toBeNull();
    expect(parseLocalizedNumber('1..2')).toBeNull();
  });
});

describe('formatNumberDraft', () => {
  it('preserva as casas decimais definidas pelo spec', () => {
    expect(formatNumberDraft(81, 1)).toBe('81.0');
    expect(formatNumberDraft(12, 3)).toBe('12.000');
  });

  it('mantém o comportamento livre quando o spec não define precisão', () => {
    expect(formatNumberDraft(81)).toBe('81');
    expect(formatNumberDraft(null, 1)).toBe('');
  });
});
