import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Sprint 4 — Planning (Ideas)', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('S4-P01: /planning page loads', async ({ page }) => {
    await page.goto('/planning');
    await expect(page.getByRole('heading', { name: /planning/i })).toBeVisible();
  });

  test('S4-P02: New Idea button is visible', async ({ page }) => {
    await page.goto('/planning');
    await expect(page.getByRole('button', { name: /new idea/i })).toBeVisible();
  });

  test('S4-P03: Create idea modal opens', async ({ page }) => {
    await page.goto('/planning');
    const btn = page.getByRole('button', { name: /new idea/i });
    if (await btn.isEnabled()) {
      await btn.click();
      await expect(page.getByText(/title/i).first()).toBeVisible();
    }
  });

  test('S4-P04: Create idea form validates empty fields', async ({ page }) => {
    await page.goto('/planning');
    const btn = page.getByRole('button', { name: /new idea/i });
    if (await btn.isEnabled()) {
      await btn.click();
      await page.click('button[type="submit"]');
      await expect(page.locator('[role="alert"], .text-destructive').first()).toBeVisible();
    }
  });

  test('S4-P05: Approve and reject buttons visible on pending ideas', async ({ page }) => {
    await page.goto('/planning');
    const approveBtn = page.getByRole('button', { name: /approve/i }).first();
    if (await approveBtn.count() > 0) {
      await expect(approveBtn).toBeVisible();
      await expect(page.getByRole('button', { name: /reject/i }).first()).toBeVisible();
    }
  });

  test('S4-P06: Security — /api/ideas requires auth', async ({ request }) => {
    const res = await request.get('/api/ideas?projectId=test');
    expect(res.status()).toBe(401);
  });

});
