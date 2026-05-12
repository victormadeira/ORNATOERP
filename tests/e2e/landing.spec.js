import { test, expect } from '@playwright/test';

// ═══════════════════════════════════════════════════════
// Landing pública — fluxo crítico #3
// O cliente novo chega aqui via Meta Ads / Google. Se quebra, perde lead.
// ═══════════════════════════════════════════════════════

test.describe('Landing pública', () => {
    test('raiz carrega a landing institucional', async ({ page }) => {
        await page.goto('/');

        // Heading principal da landing
        await expect(page.locator('h1, h2').filter({ hasText: /Sua casa merece marcenaria/i })).toBeVisible({ timeout: 10_000 });

        // CTA "VER PROJETOS"
        await expect(page.locator('text=/VER PROJETOS/i')).toBeVisible();
    });

    test('navega pra portfolio', async ({ page }) => {
        await page.goto('/portfolioornato');
        // Página de portfolio (lookbook)
        await expect(page).toHaveURL(/portfolioornato/);
    });

    test('open graph tags presentes', async ({ page }) => {
        await page.goto('/');
        const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
        const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');
        expect(ogTitle).toContain('Studio Ornato');
        expect(ogImage).toMatch(/https?:\/\//);
    });
});
