import { describe, it, expect } from 'vitest';
import { environmentProblems } from './env';

const valid = { SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic', DATABASE_URL: 'postgresql://user:pass@localhost/db' };
describe('configuração do worker', () => {
  it('IA desligada não exige chave; habilitada exige chave do provedor correto', () => {
    expect(environmentProblems(valid)).toEqual([]);
    expect(environmentProblems({ ...valid, AI_ENABLED: 'true', AI_PROVIDER: 'openai', ANTHROPIC_API_KEY: 'other' })).toContain('Chave do provedor de IA ausente');
    expect(environmentProblems({ ...valid, AI_ENABLED: 'true', AI_PROVIDER: 'openai', OPENAI_API_KEY: 'synthetic' })).toEqual([]);
  });
  it('rejeita flags e URLs inválidas sem revelar valores', () => {
    const issues = environmentProblems({ ...valid, AI_ENABLED: 'typo', DATABASE_URL: 'sensitive-value' });
    expect(issues).toContain('AI_ENABLED inválida');
    expect(issues).toContain('DATABASE_URL inválida');
    expect(JSON.stringify(issues)).not.toContain('sensitive-value');
  });
});
