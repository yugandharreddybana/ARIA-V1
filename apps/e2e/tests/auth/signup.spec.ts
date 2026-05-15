import { test, expect } from '@playwright/test';

const TEST_USER = {
  name: 'Test Engineer',
  email: `test_${Date.now()}@aria-test.dev`,
  password: 'Aria@Test123!',
};

test.describe('Signup Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/signup');
  });

  test('renders signup form', async ({ page }) => {
    await expect(page.getByText('Create your workspace')).toBeVisible();
    await expect(page.getByLabel('Full name')).toBeVisible();
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByLabel('Confirm password')).toBeVisible();
  });

  test('shows password strength checker when typing', async ({ page }) => {
    await page.getByLabel('Password').fill('test');
    await expect(page.getByText('At least 8 characters')).toBeVisible();
  });

  test('shows error when passwords do not match', async ({ page }) => {
    await page.getByLabel('Full name').fill('Test User');
    await page.getByLabel('Email address').fill('test@example.com');
    await page.getByLabel('Password').fill('Aria@Test123!');
    await page.getByLabel('Confirm password').fill('DifferentPass1!');
    await page.getByRole('button', { name: /create workspace/i }).click();
    await expect(page.getByText('Passwords do not match')).toBeVisible();
  });

  test('shows error for invalid email', async ({ page }) => {
    await page.getByLabel('Full name').fill('Test User');
    await page.getByLabel('Email address').fill('notanemail');
    await page.getByLabel('Password').fill('Aria@Test123!');
    await page.getByLabel('Confirm password').fill('Aria@Test123!');
    await page.getByRole('button', { name: /create workspace/i }).click();
    await expect(page.getByText(/valid email/i)).toBeVisible();
  });

  test('successfully signs up and redirects to dashboard', async ({ page }) => {
    await page.getByLabel('Full name').fill(TEST_USER.name);
    await page.getByLabel('Email address').fill(TEST_USER.email);
    await page.getByLabel('Password').fill(TEST_USER.password);
    await page.getByLabel('Confirm password').fill(TEST_USER.password);
    await page.getByRole('button', { name: /create workspace/i }).click();
    await expect(page).toHaveURL('/dashboard', { timeout: 10_000 });
    await expect(page.getByText('Good morning')).toBeVisible();
  });

  test('has link to login page', async ({ page }) => {
    await expect(page.getByRole('link', { name: /sign in/i })).toBeVisible();
  });
});
