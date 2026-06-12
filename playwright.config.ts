import { defineConfig } from '@playwright/test';

// E2E contra o app rodando localmente (Next dev) + projeto Supabase hosted.
// Sequencial (workers: 1) por compartilhar dados no cloud.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['line']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm --filter @naabsa/web dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
