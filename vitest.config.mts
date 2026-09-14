/**
 * Vitest config raiz — golden tests (004/T-009).
 * Os testes por pacote usam seu próprio config (apps/web, packages/core etc.).
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'golden',
    environment: 'node',
    include: ['tests/golden/**/*.test.ts'],
    testTimeout: 30000,
  },
});
