import { Page } from '@playwright/test';

export const TEST_EMAIL    = process.env.E2E_EMAIL    ?? 'test@aria.dev';
export const TEST_PASSWORD = process.env.E2E_PASSWORD ?? 'Test1234!';
export const TEST_NAME     = process.env.E2E_NAME     ?? 'E2E Tester';

export async function login(page: Page) {
  await page.goto('/login');
  await page.fill('[name="email"]', TEST_EMAIL);
  await page.fill('[name="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|projects)/);
}

export async function signup(page: Page) {
  await page.goto('/signup');
  await page.fill('[name="name"]', TEST_NAME);
  await page.fill('[name="email"]', TEST_EMAIL);
  await page.fill('[name="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/);
}
