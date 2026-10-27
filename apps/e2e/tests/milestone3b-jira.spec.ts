import { test, expect, type Page } from '@playwright/test';

async function shot(page: Page, name: string) {
  const width = page.viewportSize()?.width ?? 0;
  const kind = width >= 1200 ? 'desktop' : width <= 400 ? 'mobile' : 'tablet';
  await page.screenshot({ path: `/opt/cursor/artifacts/m3b-${name}-${kind}.png`, fullPage: true });
}

async function setupBoard(page: Page) {
  const email = `e2e-m3b-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@aria.dev`;
  await page.goto('/signup');
  await page.waitForSelector('[name="name"]', { timeout: 15_000 });
  await page.fill('[name="name"]', 'M3B Owner');
  await page.fill('[name="email"]', email);
  await page.fill('[name="password"]', 'Test1234!');
  await page.fill('[name="confirm"]', 'Test1234!');
  const signup = page.waitForResponse(
    (res) => res.url().includes('/api/auth/signup') && res.request().method() === 'POST',
    { timeout: 30_000 },
  );
  await page.click('button[type="submit"]');
  const signupRes = await signup;
  expect(signupRes.ok(), `signup HTTP ${signupRes.status()}`).toBeTruthy();
  await page.waitForURL(/\/setup/, { timeout: 30_000 });
  await page.getByTestId('setup-project-name').fill('Jira Shop');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByTestId('llm-api-key').fill('aria-mock-key');
  await page.getByTestId('test-connection').click();
  await expect(page.getByTestId('test-connection-result')).toContainText(/succeeded|verified/i, {
    timeout: 30_000,
  });
  await page.getByTestId('setup-next').click();
  await page.getByTestId('github-token').fill('aria-mock-github');
  await page.getByTestId('list-repos').click();
  await page.getByTestId('repo-acme-demo-app').check();
  await page.getByTestId('connect-repos').click();
  await expect(page.getByTestId('knowledge-summary')).toContainText(/signup/i, { timeout: 60_000 });
  await page.getByTestId('generate-company').click();
  await page.getByTestId('open-org-chart').click();
  await expect(page.getByTestId('org-chart')).toBeVisible({ timeout: 30_000 });
}

test('backlog, sprint, and story detail show AC, sub-tasks, and owner', async ({ page }) => {
  test.setTimeout(240_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await setupBoard(page);

  await page.goto('/board');
  await expect(page.getByTestId('board-view-tabs')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('view-backlog').click();
  await expect(page.getByTestId('backlog-list')).toBeVisible();
  await shot(page, 'backlog');

  await page.getByTestId('view-sprint').click();
  await page.getByTestId('sprint-name').fill('Sprint Alpha');
  await page.getByTestId('sprint-start').fill('2026-10-05');
  // Blur date field so mobile keyboards / sticky chrome don't eat the submit hit target.
  await page.getByTestId('sprint-start').blur();
  const createSprintBtn = page.getByTestId('create-sprint-form').getByRole('button', { name: /Create 10-day sprint/i });
  await createSprintBtn.scrollIntoViewIfNeeded();
  await createSprintBtn.click();
  await expect(page.getByTestId('sprint-select')).toContainText('Sprint Alpha', { timeout: 15_000 });
  await shot(page, 'sprint');

  await page.getByTestId('view-board').click();
  await page.getByTestId('new-ticket-btn').click();
  await page.fill('#ticket-title', 'Pay with card');
  await page.fill('#ticket-desc', 'Shopper pays with a saved card on checkout.');
  await page.getByTestId('ticket-points').selectOption('5');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const card = page.getByTestId('ticket-card').filter({ hasText: 'Pay with card' });
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card.getByTestId('card-owner')).toContainText(/Owner:/);
  await shot(page, 'board-card');

  await card.getByRole('link', { name: 'Pay with card' }).click();
  await expect(page.getByTestId('ticket-owner')).toContainText(/Owner:/);
  await expect(page.getByTestId('acceptance-form')).toBeVisible();
  await page.getByTestId('ac-given-0').fill('a signed-in shopper');
  await page.getByTestId('ac-when-0').fill('they submit a card');
  await page.getByTestId('ac-then-0').fill('the order is paid');
  await page.getByRole('button', { name: 'Save criteria' }).click();
  await expect(page.getByRole('status')).toContainText(/Acceptance criteria saved/i);

  await page.getByTestId('subtask-title').fill('Wire payment API');
  await page.getByTestId('create-subtask-form').getByRole('button', { name: 'Add sub-task' }).click();
  await expect(page.getByTestId('subtask-list')).toContainText('Wire payment API', { timeout: 15_000 });
  await expect(page.getByTestId('timeline')).toBeVisible();
  await shot(page, 'story-detail');

  expect(pageErrors).toEqual([]);
});
