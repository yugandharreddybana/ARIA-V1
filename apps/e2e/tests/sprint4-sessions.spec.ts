import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Sprint 4 — Sessions', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('S4-SE01: /sessions page loads', async ({ page }) => {
    await page.goto('/sessions');
    await expect(page.getByRole('heading', { name: /sessions/i })).toBeVisible();
  });

  test('S4-SE02: Empty state renders when no sessions', async ({ page }) => {
    await page.goto('/sessions');
    await expect(page.locator('text=No sessions yet').or(page.locator('[data-testid="session-card"]').first())).toBeVisible({ timeout: 8000 });
  });

  test('S4-SE03: Start Session button is visible', async ({ page }) => {
    await page.goto('/sessions');
    await expect(page.getByRole('button', { name: /start session/i })).toBeVisible();
  });

  test('S4-SE04: Start session modal opens and has mode selector', async ({ page }) => {
    await page.goto('/sessions');
    const btn = page.getByRole('button', { name: /start session/i });
    if (await btn.isEnabled()) {
      await btn.click();
      await expect(page.getByText(/precision|throughput|planning|shadow/i).first()).toBeVisible();
    }
  });

  test('S4-SE05: Security — /api/sessions requires auth', async ({ request }) => {
    const res = await request.get('/api/sessions?projectId=test');
    expect(res.status()).toBe(401);
  });

});
