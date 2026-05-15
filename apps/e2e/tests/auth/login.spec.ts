import { test, expect } from '@playwright/test';

// Uses a pre-existing test account seeded in global.setup
const TEST_USER = {
  email: 'e2e_static@aria-test.dev',
  password: 'Aria@E2E123!',
};

test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('renders login form', async ({ page }) => {
    await expect(page.getByText('Welcome back')).toBeVisible();
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
  });

  test('shows error for wrong credentials', async ({ page }) => {
    await page.getByLabel('Email address').fill('wrong@example.com');
    await page.getByLabel('Password').fill('WrongPass123!');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/invalid email or password/i)).toBeVisible({ timeout: 8_000 });
  });

  test('has link to signup page', async ({ page }) => {
    await expect(page.getByRole('link', { name: /create workspace/i })).toBeVisible();
  });

  test('show/hide password toggle works', async ({ page }) => {
    const passwordInput = page.getByLabel('Password');
    await passwordInput.fill('testpassword');
    await expect(passwordInput).toHaveAttribute('type', 'password');
    // Click the eye button
    await page.locator('button[title]').or(page.locator('button').filter({ has: page.locator('svg') }).last()).click();
    await expect(passwordInput).toHaveAttribute('type', 'text');
  });
});
