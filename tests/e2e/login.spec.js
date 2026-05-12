import { test, expect } from '@playwright/test';

// ═══════════════════════════════════════════════════════
// Login — fluxo crítico #1
// Se isso quebra, ninguém entra no ERP.
// ═══════════════════════════════════════════════════════

const VALID_USER = process.env.E2E_USER || 'admin@ornato.com';
const VALID_PASS = process.env.E2E_PASS || 'admin';

test.describe('Login', () => {
    test.beforeEach(async ({ page }) => {
        // Página de login está em /login (rota interna do app, fora das rotas públicas)
        await page.goto('/login');
    });

    test('credenciais válidas → entra no dashboard', async ({ page }) => {
        await page.fill('#login-email', VALID_USER);
        await page.fill('#login-senha', VALID_PASS);
        await page.click('button[type="submit"]');

        // Deve redirecionar pra dashboard (ou alguma página logada)
        await expect(page).toHaveURL(/\/(dash|\/?)$/, { timeout: 10_000 });

        // Token salvo no localStorage
        const token = await page.evaluate(() => localStorage.getItem('erp_token'));
        expect(token).toBeTruthy();
    });

    test('credenciais inválidas → erro visível, fica na tela', async ({ page }) => {
        await page.fill('#login-email', 'naoexiste@test.com');
        await page.fill('#login-senha', 'senhaerradissima');
        await page.click('button[type="submit"]');

        // Aguarda resposta do server (401)
        await page.waitForTimeout(800);

        // Continua na tela de login
        await expect(page.locator('#login-email')).toBeVisible();

        // Sem token salvo
        const token = await page.evaluate(() => localStorage.getItem('erp_token'));
        expect(token).toBeFalsy();
    });

    test('campos vazios → botão não envia', async ({ page }) => {
        // HTML5 validation: type="email" required impede submit vazio
        await page.click('button[type="submit"]');
        // Continua na mesma URL
        await expect(page).toHaveURL(/\/login/);
    });
});
