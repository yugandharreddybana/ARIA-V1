import { Page } from '@playwright/test';

// Credentials read from env so CI can inject real test-user creds
export const TEST_EMAIL    = process.env.E2E_EMAIL    ?? 'test@aria.dev';
export const TEST_PASSWORD = process.env.E2E_PASSWORD ?? 'Test1234!';
export const TEST_NAME     = process.env.E2E_NAME     ?? 'E2E Tester';

/**
 * Log in via the UI and wait until the dashboard or projects page is reached.
 * Re-used by every spec that requires an authenticated session.
 */
export async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.waitForSelector('[name="email"]', { timeout: 10_000 });
  await page.fill('[name="email"]', TEST_EMAIL);
  await page.fill('[name="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  // Wait for redirect — both /dashboard and /projects are valid landing pages
  await page.waitForURL(/\/(dashboard|projects)/, { timeout: 15_000 });
}

/**
 * Sign up via the UI. Uses a unique email so tests don't collide.
 * Returns the generated email so tests can reference it later.
 */
export async function signup(
  page: Page,
  overrides?: { name?: string; email?: string; password?: string },
): Promise<{ email: string; password: string }> {
  const email    = overrides?.email    ?? `e2e+${Date.now()}@aria.dev`;
  const password = overrides?.password ?? TEST_PASSWORD;
  const name     = overrides?.name     ?? TEST_NAME;
  await page.goto('/signup');
  await page.waitForSelector('[name="name"]', { timeout: 10_000 });
  await page.fill('[name="name"]',     name);
  await page.fill('[name="email"]',    email);
  await page.fill('[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  return { email, password };
}
