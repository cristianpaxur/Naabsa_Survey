import { describe, it, expect } from 'vitest';
import { environmentProblems } from './env';

const valid = { SUPABASE_URL: 'https://example.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'synthetic', DATABASE_URL: 'postgresql://u:p@localhost/db', COLLABORA_URL: 'http://office.test', WOPI_PUBLIC_URL: 'http://web.test', WOPI_TOKEN_SECRET: 'a'.repeat(32) };
describe('configuração web', () => {
  it('aceita ambiente completo sem exigir APP_BASE_URL opcional', () => expect(environmentProblems(valid)).toEqual([]));
  it('exige WOPI configurado e não expõe segredo nos diagnósticos', () => {
    const issues = environmentProblems({ ...valid, WOPI_TOKEN_SECRET: 'secret', COLLABORA_URL: '' });
    expect(issues).toContain('COLLABORA_URL ausente');
    expect(issues).toContain('WOPI_TOKEN_SECRET deve ter pelo menos 32 caracteres');
    expect(JSON.stringify(issues)).not.toContain('secret');
  });
});
