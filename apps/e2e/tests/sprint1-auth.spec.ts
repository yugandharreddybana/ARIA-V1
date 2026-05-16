import { test, expect } from '@playwright/test';
import { TEST_EMAIL, TEST_PASSWORD, TEST_NAME, login } from './helpers/auth';

test.describe('Sprint 1 — Authentication', () => {

  test('S1-01: Login page renders with email, password and submit button', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('[name="email"]')).toBeVisible();
    await expect(page.locator('[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('S1-02: Login page shows GitHub OAuth button', async ({ page }) => {
    await page.goto('/login');
    // GitHub button is an <a> tag wrapping <Button asChild> — not a native <button>
    // Use getByText as primary, with getByRole fallback via .or()
    await expect(
      page.getByText(/continue with github/i)
        .or(page.getByRole('button', { name: /github/i }))
    ).toBeVisible();
  });

  test('S1-03: Login with empty fields shows validation errors', async ({ page }) => {
    await page.goto('/login');
    await page.click('button[type="submit"]');
    await expect(page.locator('[role="alert"], .text-destructive')).toBeVisible();
  });

  test('S1-04: Login with wrong credentials shows error', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name="email"]', 'wrong@aria.dev');
    await page.fill('[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    await expect(page.locator('[role="alert"], .text-destructive')).toBeVisible();
  });

  test('S1-05: Signup page renders all fields', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.locator('[name="name"]')).toBeVisible();
    await expect(page.locator('[name="email"]')).toBeVisible();
    await expect(page.locator('[name="password"]')).toBeVisible();
  });

  test('S1-06: Password strength indicator visible on signup', async ({ page }) => {
    await page.goto('/signup');
    await page.fill('[name="password"]', 'weak');
    // Strength meter renders as an inline <ul> checklist — no .password-strength class or data-testid
    // Match the first rule label that is always rendered: "At least 8 characters"
    await expect(page.getByText('At least 8 characters')).toBeVisible();
  });

  test('S1-07: Unauthenticated user is redirected from /dashboard to /login', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL(/\/login/);
  });

  test('S1-08: Unauthenticated user is redirected from /tickets to /login', async ({ page }) => {
    await page.goto('/tickets');
    await page.waitForURL(/\/login/);
  });

  test('S1-09: Valid login navigates to dashboard', async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL(/\/(dashboard|projects)/);
  });

  test('S1-10: Sidebar shows ARIA logo and nav items after login', async ({ page }) => {
    await login(page);
    await expect(page.getByText('ARIA')).toBeVisible();
    await expect(page.getByRole('link', { name: /dashboard/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /tickets/i })).toBeVisible();
  });

  test('S1-11: Logout clears session and redirects to login', async ({ page }) => {
    await login(page);
    await page.click('button[title="Sign out"]');
    await page.waitForURL(/\/login/);
  });

  test('S1-12: Security — no auth token visible in HTML source', async ({ page }) => {
    await login(page);
    const content = await page.content();
    expect(content).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  });

});
