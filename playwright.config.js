// ═══════════════════════════════════════════════════════
// Playwright E2E config
// ═══════════════════════════════════════════════════════
// Cobertura: fluxos críticos que se quebrarem param o negócio.
//
// Pré-requisito (uma vez por máquina):
//   npx playwright install chromium
//
// Rodar:
//   npm run test:e2e          → roda contra dev server local
//   npm run test:e2e:headed   → abre o browser pra ver o que tá rolando
//
// Variáveis de ambiente:
//   E2E_BASE_URL              → URL alvo (default http://localhost:5173)
//   E2E_USER / E2E_PASS       → credenciais de teste (default admin/admin)

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: false, // testes compartilham o mesmo DB local
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: 1, // serialize — evita conflitos de DB durante criação de entidades
    reporter: process.env.CI ? 'github' : 'list',
    use: {
        baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'mobile',
            testMatch: /.*\.mobile\.spec\.js/,
            use: { ...devices['iPhone 13'] },
        },
    ],
});
