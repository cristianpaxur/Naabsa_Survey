import { describe, expect, it } from 'vitest';
import {
  isValidEmail,
  normalizeEmail,
  wouldRemoveLastActiveAdmin,
} from './rules';

describe('regras de usuários', () => {
  it('normaliza e valida e-mail', () => {
    expect(normalizeEmail(' Admin@Naabsa.COM ')).toBe('admin@naabsa.com');
    expect(isValidEmail('admin@naabsa.com')).toBe(true);
    expect(isValidEmail('email-invalido')).toBe(false);
  });

  it('impede remover o último admin ativo', () => {
    expect(
      wouldRemoveLastActiveAdmin({
        currentRole: 'admin',
        currentStatus: 'active',
        nextStatus: 'inactive',
        activeAdminCount: 1,
      }),
    ).toBe(true);
    expect(
      wouldRemoveLastActiveAdmin({
        currentRole: 'admin',
        currentStatus: 'active',
        nextRole: 'operator',
        activeAdminCount: 2,
      }),
    ).toBe(false);
  });
});
