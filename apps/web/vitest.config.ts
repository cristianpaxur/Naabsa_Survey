import { defineConfig } from 'vitest/config';

// Testes unitários de lógica pura do app (ex.: máquina de estados, lockGuard do
// editor). Os testes de UI/fluxo ficam no E2E (Playwright).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'components/**/*.test.ts'],
  },
});
