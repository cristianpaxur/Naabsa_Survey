/**
 * Vitest config raiz — golden tests (004/T-009).
 * Os testes por pacote usam seu próprio config (apps/web, packages/core etc.).
 */
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    name: 'golden',
    environment: 'node',
    include: ['tests/golden/**/*.test.ts'],
    // CSS é no-op no contexto node (apenas para renderToStaticMarkup)
    css: false,
  },
});
