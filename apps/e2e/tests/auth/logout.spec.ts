import { test, expect } from '@playwright/test';

const TEST_USER = {
  name: `Logout Tester ${Date.now()}`,
  email: `logout_${Date.now()}@aria-test.dev`,
  password: 'Aria@Logout123!',
};

test.describe('Logout', () => {
  test('user can sign up, see dashboard, then log out and is redirected', async ({ page }) => {
    // Sign up first
    await page.goto('/signup');
    await page.getByLabel('Full name').fill(TEST_USER.name);
    await page.getByLabel('Email address').fill(TEST_USER.email);
    await page.getByLabel('Password').fill(TEST_USER.password);
    await page.getByLabel('Confirm password').fill(TEST_USER.password);
    await page.getByRole('button', { name: /create workspace/i }).click();
    await expect(page).toHaveURL('/dashboard', { timeout: 10_000 });

    // Logout via sidebar button
    await page.getByTitle('Sign out').click();

    // Should end up on login or landing
    await expect(page).toHaveURL(/login|^\//, { timeout: 8_000 });

    // /dashboard should now redirect back
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/login', { timeout: 8_000 });
  });
});
