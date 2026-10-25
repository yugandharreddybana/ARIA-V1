import { test, expect } from '@playwright/test';

test('signup through org chart with mock providers', async ({ page }) => {
  const email = `e2e-m1-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@aria.dev`;
  await page.goto('/signup');
  await page.fill('[name="name"]', 'Milestone Owner');
  await page.fill('[name="email"]', email);
  await page.fill('[name="password"]', 'Test1234!');
  await page.fill('[name="confirm"]', 'Test1234!');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/);
  await expect(page.getByTestId('dashboard-greeting')).toBeVisible();

  await page.getByTestId('start-setup').click();
  await page.getByTestId('setup-project-name').fill('Demo Shop');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByTestId('provider-cursor')).toBeVisible();
  await page.getByTestId('llm-api-key').fill('aria-mock-key');
  await page.getByTestId('test-connection').click();
  await expect(page.getByTestId('test-connection-result')).toContainText(/succeeded|verified/i);
  await page.getByTestId('setup-next').click();

  await page.getByTestId('github-token').fill('aria-mock-github');
  await page.getByTestId('list-repos').click();
  await page.getByTestId('repo-acme-demo-app').check();
  await page.getByTestId('connect-repos').click();

  await expect(page.getByTestId('knowledge-summary')).toContainText(/signup/i, { timeout: 20_000 });
  await expect(page.getByTestId('knowledge-flow').filter({ hasText: 'Login' })).toBeVisible();
  await page.getByTestId('generate-company').click();
  await page.getByTestId('open-org-chart').click();

  await expect(page.getByTestId('org-chart')).toBeVisible();
  const ceo = page.locator('[data-testid^="agent-ceo"]');
  await expect(ceo).toBeVisible();
  await ceo.click();
  await page.getByTestId('agent-instructions').fill('Own the company priorities. Stay off when disabled.');
  const save = page.waitForResponse((res) => res.url().includes('/agents/') && res.request().method() === 'PATCH' && res.ok());
  await page.getByTestId('save-agent').click();
  await save;
  const toggle = page.waitForResponse((res) => res.url().includes('/agents/') && res.request().method() === 'PATCH' && res.ok());
  await page.getByTestId('agent-toggle').click();
  await toggle;
  await expect(ceo).toContainText('OFF');
});
