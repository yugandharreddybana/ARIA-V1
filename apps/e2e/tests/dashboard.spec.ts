import { test, expect } from '@playwright/test';
import { loginAsTestUser, revealNav } from './helpers/auth';

test.describe('Home', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test('sends /dashboard to the projects home', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/projects/);
    await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
  });

  test('projects home offers one way to create a project', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.getByRole('button', { name: 'New Project' })).toHaveCount(1);
    await expect(page.getByTestId('start-setup')).toBeVisible();
  });

  test('sidebar lists Projects, Company, Board, Runs, and Settings', async ({ page }) => {
    await page.goto('/projects');
    await revealNav(page);
    const nav = page.locator('aside');
    for (const name of ['Projects', 'Company', 'Board', 'Runs', 'Settings']) {
      await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
    }
  });
});
