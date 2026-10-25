import { test, expect } from '@playwright/test';

test('signup through org chart with mock providers', async ({ page }) => {
  const email = `e2e-m1-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@aria.dev`;
  await page.goto('/signup');
  await page.fill('[name="name"]', 'Milestone Owner');
  await page.fill('[name="email"]', email);
  await page.fill('[name="password"]', 'Test1234!');
  await page.fill('[name="confirm"]', 'Test1234!');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/setup/);

  await page.getByTestId('setup-project-name').fill('Demo Shop');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  await expect(page.getByTestId('provider-cursor')).toBeVisible();
  await page.getByTestId('llm-api-key').fill('aria-mock-key');
  await page.getByTestId('test-connection').click();
  await expect(page.getByTestId('test-connection-result')).toContainText(/succeeded|verified/i);
  await page.getByTestId('setup-next').click();

  await page.getByTestId('github-token').fill('aria-mock-github');
  await page.getByTestId('list-repos').click();
  await page.getByTestId('repo-acme-demo-app').check();
  await page.getByTestId('connect-repos').click();

  await expect(page.getByTestId('knowledge-summary')).toContainText(/signup/i, { timeout: 45_000 });
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

  await page.getByTestId('new-agent-name').fill('Nora Analyst');
  await page.getByTestId('new-agent-role').selectOption('qa');
  const manager = page.getByTestId('new-agent-manager');
  await manager.selectOption({ index: 1 });
  const added = page.waitForResponse((res) => res.url().includes('/agents') && res.request().method() === 'POST' && res.ok());
  await page.getByTestId('add-agent').click();
  await added;
  const nora = page.getByRole('button', { name: /Nora Analyst/ });
  await expect(nora).toBeVisible();
  await nora.click();
  await page.getByTestId('agent-delete').click();
  const deleted = page.waitForResponse((res) => res.request().method() === 'DELETE' && res.ok());
  await page.getByTestId('agent-delete-confirm').click();
  await deleted;
  await expect(page.getByRole('button', { name: /Nora Analyst/ })).toHaveCount(0);
});
