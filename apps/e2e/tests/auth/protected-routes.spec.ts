import { test, expect } from '@playwright/test';

test.describe('Protected Routes', () => {
  test('unauthenticated user is redirected from /dashboard to /login', async ({ page }) => {
    // Clear cookies to ensure no auth state
    await page.context().clearCookies();
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/login', { timeout: 10_000 });
  });

  test('unauthenticated user is redirected from /projects to /login', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/projects');
    await expect(page).toHaveURL('/login', { timeout: 10_000 });
  });

  test('unauthenticated user is redirected from /tickets to /login', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/tickets');
    await expect(page).toHaveURL('/login', { timeout: 10_000 });
  });
});
