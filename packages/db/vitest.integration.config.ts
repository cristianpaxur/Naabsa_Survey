import { defineConfig } from 'vitest/config';

if (process.env.RUN_DB_TESTS !== '1' || process.env.NAABSA_TEST_DATABASE !== 'isolated') {
  throw new Error('Testes externos exigem RUN_DB_TESTS=1 e NAABSA_TEST_DATABASE=isolated, em um projeto Supabase exclusivo de testes.');
}
export default defineConfig({ test: { environment: 'node', include: ['tests/**/*.test.ts'] } });
