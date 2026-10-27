import { test, expect } from '@playwright/test';

async function signup(page: import('@playwright/test').Page) {
  const email = `e2e-m3a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@aria.dev`;
  await page.goto('/signup');
  await page.fill('[name="name"]', 'M3A Owner');
  await page.fill('[name="email"]', email);
  await page.fill('[name="password"]', 'Test1234!');
  await page.fill('[name="confirm"]', 'Test1234!');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/setup/);
}

test('setup blocks without coding activate; coding list omits ollama; multi-key settings', async ({ page }) => {
  await signup(page);

  await page.getByTestId('setup-project-name').fill('Provider Shop');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  await expect(page.getByTestId('provider-credentials-panel')).toBeVisible();
  await expect(page.getByTestId('provider-list-planning')).toBeVisible();
  await expect(page.getByTestId('provider-cursor')).toBeVisible();
  await expect(page.getByTestId('provider-ollama')).toBeVisible();

  await page.getByTestId('tier-tab-coding').click();
  await expect(page.getByTestId('provider-list-coding')).toBeVisible();
  await expect(page.getByTestId('provider-cursor')).toBeVisible();
  await expect(page.getByTestId('provider-claude_code')).toBeVisible();
  await expect(page.getByTestId('provider-list-coding').getByTestId('provider-ollama')).toHaveCount(0);

  await expect(page.getByTestId('setup-next')).toBeDisabled();

  await page.getByTestId('tier-tab-planning').click();
  await page.getByTestId('provider-cursor').click();
  await page.getByTestId('llm-api-key').fill('aria-mock-key');
  await page.getByTestId('test-connection').click();
  await expect(page.getByTestId('test-connection-result')).toContainText(/activated|succeeded|verified/i, { timeout: 15_000 });
  await expect(page.getByTestId('active-planning-badge')).toBeVisible({ timeout: 15_000 });

  await page.getByTestId('setup-next').click();
  await expect(page.getByTestId('github-token')).toBeVisible({ timeout: 15_000 });

  await page.getByTestId('github-token').fill('aria-mock-github');
  await page.getByTestId('list-repos').click();
  await page.getByTestId('repo-acme-demo-app').check();
  await page.getByTestId('connect-repos').click();
  await expect(page.getByTestId('knowledge-summary')).toBeVisible({ timeout: 45_000 });
  await page.getByTestId('generate-company').click();
  await page.getByTestId('open-org-chart').click();

  await page.goto('/settings');
  await expect(page.getByTestId('provider-credentials-panel')).toBeVisible();
  await page.getByTestId('credential-label').fill('personal');
  await page.getByTestId('tier-tab-planning').click();
  await page.getByTestId('provider-cursor').click();
  await page.getByTestId('credential-api-key').fill('aria-mock-key-personal');
  await page.getByTestId('test-connection').click();
  await expect(page.getByTestId('credential-cursor-personal')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('settings-model-tiers')).toBeVisible();
  await page.getByTestId('tier-planning').selectOption('auto');
  await page.getByRole('button', { name: 'Save tiers' }).click();
});
