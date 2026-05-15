import type { Page } from '@playwright/test';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

export async function loginAsTestUser(page: Page) {
  const email = process.env.E2E_USER_EMAIL ?? 'e2e@aria.dev';
  const password = process.env.E2E_USER_PASSWORD ?? 'e2epassword';

  await page.goto(`${WEB_URL}/login`);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard/);
}

export async function createProject(page: Page, name: string, description?: string) {
  await page.goto(`${WEB_URL}/projects`);
  await page.getByRole('button', { name: /new project/i }).click();
  await page.getByLabel('Name').fill(name);
  if (description) await page.getByLabel(/description/i).fill(description);
  await page.getByRole('button', { name: /create/i }).last().click();
  await page.waitForSelector(`text=${name}`);
}

export async function deleteProject(page: Page, projectName: string) {
  // Placeholder — archive via API in future sprint
  console.log(`[E2E] deleteProject called for: ${projectName}`);
}
