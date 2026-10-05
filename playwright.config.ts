import { defineConfig, devices } from '@playwright/test';

/** Testes de tela contra o MODO DEMONSTRAÇÃO (sem variáveis do Supabase). `PW_CHROMIUM` aponta para um Chromium já instalado. */
const porta = 5199;
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${porta}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -- --port ${porta} --host 127.0.0.1`,
    url: `http://127.0.0.1:${porta}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
  },
});
