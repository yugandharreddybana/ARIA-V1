import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
  test('loads successfully', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/ARIA/);
  });

  test('shows hero headline', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Your AI Engineering')).toBeVisible();
  });

  test('has Get Started CTA that links to /signup', async ({ page }) => {
    await page.goto('/');
    const ctaLinks = page.getByRole('link', { name: /get started/i });
    const firstCta = ctaLinks.first();
    await expect(firstCta).toBeVisible();
    await expect(firstCta).toHaveAttribute('href', '/signup');
  });

  test('has Sign in link that goes to /login', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /sign in/i }).first().click();
    await expect(page).toHaveURL('/login');
  });

  test('shows How it Works section', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('How ARIA Works')).toBeVisible();
  });
});
