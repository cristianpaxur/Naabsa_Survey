import { defineConfig } from '@playwright/test';

// E2E somente em ambiente isolado. O setup recusa execução sem declaração explícita.
// E2E_BASE_URL usa um app já iniciado; sem ela, inicia apenas o Next local.
export default defineConfig({
  globalSetup: './tests/e2e/check-environment.ts',
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['line']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'pnpm --filter @naabsa/web dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
