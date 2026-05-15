import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test('shows all three stat cards', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText('Projects')).toBeVisible();
    await expect(page.getByText('Repos Connected')).toBeVisible();
    await expect(page.getByText('Last Analysis')).toBeVisible();
  });

  test('project count card shows a number', async ({ page }) => {
    await page.goto('/dashboard');
    const card = page.locator('text=Projects').locator('..').locator('..');
    await expect(card.locator('p.text-3xl')).toBeVisible();
  });
});
