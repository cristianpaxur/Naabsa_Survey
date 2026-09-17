import { describe, expect, it } from 'vitest';
import { formatNumberDraft, parseLocalizedNumber } from './localized-number';

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
