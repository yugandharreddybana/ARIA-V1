import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Sprint 4 — Planning (Ideas)', () => {

  test.beforeEach(async ({ page }) => { await login(page); });

  test('S4-P01: planning page loads with heading', async ({ page }) => {
    await page.goto('/planning');
    await expect(page.getByRole('heading', { name: /planning|ideas/i })).toBeVisible();
  });

  test('S4-P02: idea cards render or empty state shown', async ({ page }) => {
    await page.goto('/planning');
    const cards = page.locator('[data-testid="idea-card"]');
    const empty = page.getByText(/no ideas/i);
    if (await cards.count() === 0) {
      await expect(empty).toBeVisible();
    } else {
      expect(await cards.count()).toBeGreaterThan(0);
    }
  });

  test('S4-P03: create idea button is visible', async ({ page }) => {
    await page.goto('/planning');
    await expect(
      page.locator('[data-testid="new-idea-btn"], button:has-text("New Idea"), button:has-text("Add Idea")'),
    ).toBeVisible();
  });

  test('S4-P04: GET /api/ideas requires auth', async ({ request }) => {
    expect((await request.get('/api/ideas?projectId=test')).status()).toBe(401);
  });

  test('S4-P05: POST /api/ideas requires auth', async ({ request }) => {
    expect((await request.post('/api/ideas', { data: {} })).status()).toBe(401);
  });

  test('S4-P06: PATCH /api/ideas/:id/approve requires auth', async ({ request }) => {
    expect(
      (await request.patch(
        '/api/ideas/00000000-0000-0000-0000-000000000000/approve',
        { data: { approved: true } },
      )).status(),
    ).toBe(401);
  });

});
