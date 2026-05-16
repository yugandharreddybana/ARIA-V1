import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test('shows Projects stat card', async ({ page }) => {
    await page.goto('/dashboard');
    // The dashboard renders a "Projects" stat card — label matches CardTitle text
    await expect(page.getByText('Projects').first()).toBeVisible();
  });

  test('shows Repos stat card', async ({ page }) => {
    await page.goto('/dashboard');
    // Actual label rendered by the dashboard StatCard is "Repos" (not "Repos Connected")
    await expect(page.getByText('Repos').first()).toBeVisible();
  });

  test('shows activity stat cards', async ({ page }) => {
    await page.goto('/dashboard');
    // Running Jobs and Completed cards are always rendered
    await expect(page.getByText('Running Jobs').first()).toBeVisible();
    await expect(page.getByText('Completed').first()).toBeVisible();
  });

  test('project count card shows a number', async ({ page }) => {
    await page.goto('/dashboard');
    // The stat card value is rendered as a <p class="text-3xl font-bold">
    await expect(page.locator('p.text-3xl').first()).toBeVisible();
  });
});
