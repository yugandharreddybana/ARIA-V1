import { test, expect } from '@playwright/test';
import { revealNav } from '../helpers/auth';

const TEST_USER = {
  name: `Logout Tester ${Date.now()}`,
  email: `logout_${Date.now()}@aria-test.dev`,
  password: 'Aria@Logout123!',
};

test.describe('Logout', () => {
  test('user can sign up, then log out and is sent back to sign in', async ({ page }) => {
    await page.goto('/signup');
    await page.getByLabel('Full name').fill(TEST_USER.name);
    await page.getByLabel('Email address').fill(TEST_USER.email);
    await page.getByLabel('Password', { exact: true }).fill(TEST_USER.password);
    await page.getByLabel('Confirm password').fill(TEST_USER.password);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page).toHaveURL(/\/setup/, { timeout: 10_000 });

    await revealNav(page);
    await page.getByTitle('Sign out').click();
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });

    await page.goto('/dashboard');
    await expect(page).toHaveURL('/login', { timeout: 8_000 });
  });
});
