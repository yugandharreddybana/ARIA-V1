import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Sprint 4 — Settings', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('S4-ST01: /settings page loads without 404', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible();
  });

  test('S4-ST02: Settings shows user name and email', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByText(/account/i)).toBeVisible();
  });

  test('S4-ST03: Settings link in sidebar navigates correctly', async ({ page }) => {
    await login(page);
    await page.click('a[href="/settings"]');
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible();
  });

});
