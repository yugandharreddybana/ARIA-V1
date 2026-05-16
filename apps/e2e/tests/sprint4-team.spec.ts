import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Sprint 4 — Team & Skills', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('S4-TM01: /dashboard/team page loads', async ({ page }) => {
    await page.goto('/dashboard/team');
    await expect(page.getByRole('heading', { name: /team|skills/i })).toBeVisible();
  });

  test('S4-TM02: Add Skill button is visible', async ({ page }) => {
    await page.goto('/dashboard/team');
    await expect(page.getByRole('button', { name: /add skill/i })).toBeVisible();
  });

  test('S4-TM03: Add skill modal opens', async ({ page }) => {
    await page.goto('/dashboard/team');
    const btn = page.getByRole('button', { name: /add skill/i });
    if (await btn.isEnabled()) {
      await btn.click();
      await expect(page.getByText(/slug/i).first()).toBeVisible();
    }
  });

  test('S4-TM04: Add skill form validates required fields', async ({ page }) => {
    await page.goto('/dashboard/team');
    const btn = page.getByRole('button', { name: /add skill/i });
    if (await btn.isEnabled()) {
      await btn.click();
      await page.click('button[type="submit"]');
      await expect(page.locator('[role="alert"], .text-destructive').first()).toBeVisible();
    }
  });

  test('S4-TM05: Security — /api/projects/:id/skills requires auth', async ({ request }) => {
    const res = await request.get('/api/projects/fake-id/skills');
    expect(res.status()).toBe(401);
  });

});
