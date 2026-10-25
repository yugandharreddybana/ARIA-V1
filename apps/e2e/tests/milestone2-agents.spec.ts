import { test, expect, type Page } from '@playwright/test';

async function shot(page: Page, name: string) {
  const width = page.viewportSize()?.width ?? 0;
  const kind = width >= 1200 ? 'desktop' : width <= 400 ? 'mobile' : '';
  if (!kind) return;
  await page.screenshot({ path: `/opt/cursor/artifacts/m2-${name}-${kind}.png`, fullPage: true });
}

async function setupCompany(page: Page) {
  const email = `e2e-m2-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@aria.dev`;
  await page.goto('/signup');
  await page.fill('[name="name"]', 'Milestone Owner');
  await page.fill('[name="email"]', email);
  await page.fill('[name="password"]', 'Test1234!');
  await page.fill('[name="confirm"]', 'Test1234!');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/setup/);
  await page.getByTestId('setup-project-name').fill('Demo Shop');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByTestId('llm-api-key').fill('aria-mock-key');
  await page.getByTestId('test-connection').click();
  await expect(page.getByTestId('test-connection-result')).toContainText(/succeeded|verified/i);
  await page.getByTestId('setup-next').click();
  await page.getByTestId('github-token').fill('aria-mock-github');
  await page.getByTestId('list-repos').click();
  await page.getByTestId('repo-acme-demo-app').check();
  await page.getByTestId('connect-repos').click();
  await expect(page.getByTestId('knowledge-summary')).toContainText(/signup/i, { timeout: 60_000 });
  await expect(page.getByTestId('enrichment-status')).toBeVisible();
  await shot(page, 'setup-knowledge');
  await page.getByTestId('generate-company').click();
  await page.getByTestId('open-org-chart').click();
  await expect(page.getByTestId('org-chart')).toBeVisible();
}

test('a ticket moves through review and QA with a timeline and evidence', async ({ page }) => {
  test.setTimeout(240_000);
  await setupCompany(page);
  await shot(page, 'company');

  await page.goto('/board');
  await page.getByTestId('new-ticket-btn').click();
  await page.fill('#ticket-title', 'Checkout button');
  await page.fill('#ticket-desc', 'Add a checkout button to the shop.');
  await page.getByTestId('ticket-points').selectOption('5');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const card = page.getByTestId('ticket-card').filter({ hasText: 'Checkout button' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('5 pt');
  await card.getByTestId('approve-ticket').click();

  await expect(async () => {
    await page.reload();
    await expect(page.getByTestId('column-awaiting_merge').getByRole('link', { name: 'Checkout button' })).toBeVisible();
  }).toPass({ timeout: 150_000 });
  await expect(page.getByTestId('column-awaiting_merge').getByTestId('ticket-card')).toContainText(/pt|Awaiting merge|QA|Develop|Review/);
  await shot(page, 'board');

  const ticketLink = page.getByTestId('column-awaiting_merge').getByRole('link', { name: 'Checkout button' });
  await ticketLink.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('chain-status')).toContainText('Hash chain verified');
  await expect(page.getByTestId('timeline').locator('li').first()).toBeVisible();
  await page.getByTestId('event-type-filter').selectOption('status_change');
  await expect(page.getByTestId('timeline')).toContainText('status_change');
  await page.getByTestId('edit-points').selectOption('13');
  await page.getByRole('button', { name: 'Save points' }).click();
  await expect(page.getByTestId('split-suggestion')).toBeVisible();
  await expect(page.getByTestId('evidence-gate')).toContainText(/Gate passed|evidence/i);
  const markdown = page.waitForEvent('download');
  await page.getByTestId('download-dev-md').click();
  expect((await markdown).suggestedFilename()).toContain('.md');
  const pdf = page.waitForEvent('download');
  await page.getByTestId('download-qa-pdf').click();
  expect((await pdf).suggestedFilename()).toContain('.pdf');
  const exported = page.waitForEvent('download');
  await page.getByTestId('export-markdown').click();
  expect((await exported).suggestedFilename()).toContain('.md');
  await shot(page, 'ticket');

  await page.goto('/runs');
  await expect(page.getByTestId('budget-usage')).toBeVisible();
  await expect(page.getByTestId('run-row').first()).toBeVisible();
  await page.getByTestId('run-row').first().click();
  await expect(page.getByTestId('run-detail')).toBeVisible();
  await page.keyboard.press('Tab');
  const trapped = await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') != null);
  expect(trapped).toBe(true);
  await page.keyboard.press('Escape');
  await shot(page, 'runs');

  await page.goto('/settings');
  await expect(page.getByTestId('github-guard')).toBeVisible();
  await expect(page.getByTestId('settings-budget')).toBeVisible();
  await shot(page, 'settings');

  await page.goto('/projects');
  await expect(page.getByTestId('rename-project').first()).toBeVisible();
  await expect(page.getByTestId('archive-project').first()).toBeVisible();
  await page.getByRole('button', { name: /new project/i }).click();
  await page.getByRole('dialog', { name: 'New project' }).getByRole('textbox', { name: 'Name' }).fill('Temp Shop');
  await page.getByRole('button', { name: /^create$/i }).click();
  const temp = page.getByTestId('project-card').filter({ hasText: 'Temp Shop' });
  await temp.getByTestId('rename-project').click();
  await page.getByRole('dialog', { name: 'Rename project' }).getByRole('textbox', { name: 'Name' }).fill('Temp Shop Renamed');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Temp Shop Renamed')).toBeVisible();
  await page.getByTestId('project-card').filter({ hasText: 'Temp Shop Renamed' }).getByTestId('archive-project').click();
  await page.getByRole('dialog', { name: 'Archive project' }).getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByTestId('project-card').filter({ hasText: 'Temp Shop Renamed' })).toContainText('archived');
  await shot(page, 'projects');

  await page.goto('/board');
  await page.getByTestId('new-ticket-btn').click();
  await page.fill('#ticket-title', 'Slow receipt');
  await page.fill('#ticket-desc', 'Hold the run. [[stub:slow=20000]]');
  await page.getByTestId('ticket-points').selectOption('2');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const approved = page.waitForResponse((res) => res.url().includes('/api/tickets/') && res.request().method() === 'PATCH');
  await page.getByTestId('ticket-card').filter({ hasText: 'Slow receipt' }).getByTestId('approve-ticket').click();
  expect((await approved).ok()).toBeTruthy();
  await page.goto('/runs');
  const live = page.getByTestId('run-row').filter({ hasText: /queued|running/ });
  await expect(async () => {
    if (await live.count() === 0) await page.reload();
    await expect(live.first()).toBeVisible();
  }).toPass({ timeout: 25_000 });
  await live.first().click();
  await page.getByTestId('cancel-run').click();
  await expect(page.getByTestId('run-detail')).toContainText('cancelled', { timeout: 10_000 });

  const violations = await page.request.get('http://127.0.0.1:4010/__stub/violations');
  if (violations.ok()) {
    expect(await violations.json()).toEqual({ violations: 0 });
  }
});
