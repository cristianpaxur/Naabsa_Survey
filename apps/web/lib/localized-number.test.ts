import { describe, expect, it } from 'vitest';
import { parseLocalizedNumber } from './localized-number';

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
