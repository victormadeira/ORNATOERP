import { test, expect } from '@playwright/test';

// ═══════════════════════════════════════════════════════
// Portal do Cliente (público, sem auth) — fluxo crítico #2
// Se quebra, o cliente abre o link e não vê nada.
// ═══════════════════════════════════════════════════════
//
// Requer um token de portal válido no banco. Por padrão usa o env
// E2E_PORTAL_TOKEN. Caso não exista, o teste é skipped.

const PORTAL_TOKEN = process.env.E2E_PORTAL_TOKEN || '';

test.describe('Portal do Cliente público', () => {
    test.skip(!PORTAL_TOKEN, 'Defina E2E_PORTAL_TOKEN com um token válido no banco');

    test('token válido → portal carrega com nome do cliente', async ({ page }) => {
        await page.goto(`/portal/${PORTAL_TOKEN}`);

        // Wordmark Ornato visível
        await expect(page.locator('text=/ORNATO|Ornato/i').first()).toBeVisible({ timeout: 10_000 });

        // "Olá, [nome]" no hero
        await expect(page.locator('h1')).toBeVisible();

        // Não deve mostrar erro
        await expect(page.locator('text=/Link inválido|Link indisponível/')).toHaveCount(0);
    });

    test('token inválido → mostra erro amigável', async ({ page }) => {
        await page.goto('/portal/0000000000000000000000000000000000000000');
        await expect(page.locator('text=/Link inválido|Link indisponível/')).toBeVisible({ timeout: 10_000 });
    });

    test('rota legacy ?portal=TOKEN também funciona', async ({ page }) => {
        await page.goto(`/?portal=${PORTAL_TOKEN}`);
        // Deve renderizar o portal, não a landing
        await expect(page.locator('h1')).toBeVisible({ timeout: 10_000 });
        // Landing tem heading com "Sua casa merece..." — não deve aparecer
        await expect(page.locator('text=/Sua casa merece marcenaria/')).toHaveCount(0);
    });
});
