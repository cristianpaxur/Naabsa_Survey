import { describe, expect, it } from 'vitest';
import { isActiveProfile, isCurrentAccessToken } from './access';

describe('autorização após revogação', () => {
  it('nega usuário ausente, pendente, inativo e papel desconhecido', () => {
    for (const profile of [null, { role: 'admin', status: 'inactive' },
      { role: 'operator', status: 'pending' }, { role: 'owner', status: 'active' }]) {
      expect(isActiveProfile(profile)).toBe(false);
    }
    expect(isActiveProfile({ role: 'admin', status: 'active' })).toBe(true);
  });
  it('reativação não restaura um token WOPI antigo nem legado sem emissão', () => {
    const profile = { role: 'operator', status: 'active', access_revoked_at: '2026-09-14T12:00:00.500Z' };
    const before = Date.parse('2026-09-14T12:00:00Z') / 1000;
    expect(isCurrentAccessToken(profile)).toBe(false);
    expect(isCurrentAccessToken(profile, before)).toBe(false);
    expect(isCurrentAccessToken(profile, before + 1)).toBe(true);
    expect(isCurrentAccessToken({ ...profile, status: 'inactive' }, before + 1)).toBe(false);
    expect(isCurrentAccessToken({ ...profile, access_revoked_at: 'invalid' }, before + 1)).toBe(false);
  });
});
