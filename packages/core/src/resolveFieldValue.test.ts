import { describe, it, expect } from 'vitest';
import { resolveFieldValue } from './resolveFieldValue';

describe('resolveFieldValue (RF-13)', () => {
  it('usa o override quando presente', () => {
    expect(resolveFieldValue('x', { x: 'novo' }, { x: 'antigo' })).toBe('novo');
  });

  it('cai no extraído quando não há override', () => {
    expect(resolveFieldValue('x', {}, { x: 'antigo' })).toBe('antigo');
  });

  it('mantém override falsy legítimo (0, "", false)', () => {
    expect(resolveFieldValue('a', { a: 0 }, { a: 99 })).toBe(0);
    expect(resolveFieldValue('b', { b: '' }, { b: 'x' })).toBe('');
    expect(resolveFieldValue('c', { c: false }, { c: true })).toBe(false);
  });

  it('mantém valor extraído falsy quando não há override', () => {
    expect(resolveFieldValue('a', {}, { a: 0 })).toBe(0);
    expect(resolveFieldValue('b', {}, { b: '' })).toBe('');
  });

  it('override null cai no extraído (semântica do ??)', () => {
    expect(resolveFieldValue('x', { x: null }, { x: 'antigo' })).toBe('antigo');
  });

  it('ambos ausentes → null', () => {
    expect(resolveFieldValue('x', {}, {})).toBeNull();
  });
});
