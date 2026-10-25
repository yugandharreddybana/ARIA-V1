import { test, expect, type APIRequestContext } from '@playwright/test';
import { login, TEST_EMAIL, TEST_PASSWORD } from './helpers/auth';

/**
 * Agent and human ticket flows on the board.
 * A fresh project gets a company so the agent calls have a real skill and session.
 */

const MIX = {
  business: 0, qa: 1, frontend: 1, backend: 1, fullstack: 0,
  junior: 0, aiml: 0, devops: 0, security: 0,
};

async function boardContext(request: APIRequestContext): Promise<{
  accessToken: string;
  projectId: string;
  skillId: string;
  sessionId: string;
}> {
  const loginRes = await request.post('/api/auth/login', {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });
  expect(loginRes.status()).toBe(200);
  const { accessToken } = await loginRes.json();
  const headers = { Authorization: `Bearer ${accessToken}` };

  const created = await request.post('/api/projects', {
    headers,
    data: { name: `Kanban ${Date.now()}` },
  });
  expect(created.ok()).toBeTruthy();
  const projectId: string = (await created.json()).project.id;

  await request.post(`/api/projects/${projectId}/company`, {
    headers,
    data: { size: 4, mix: MIX },
  });

  const skillsRes = await request.get(`/api/projects/${projectId}/skills`, { headers });
  expect(skillsRes.ok()).toBeTruthy();
  const { skills } = await skillsRes.json();
  expect(skills.length).toBeGreaterThan(0);

  const sessionRes = await request.post('/api/sessions', {
    headers,
    data: { projectId, mode: 'precision', missionType: 'feature' },
  });
  expect(sessionRes.ok()).toBeTruthy();
  const sessionId: string = (await sessionRes.json()).session.id;

  return { accessToken, projectId, skillId: skills[0].id, sessionId };
}

test.describe('Kanban — human create flow', () => {
  test('user can open modal, fill form, and see ticket in Backlog', async ({ page }) => {
    await login(page);
    await page.goto('/board');
    await page.waitForSelector('[data-testid="column-backlog"]');

    await page.click('[data-testid="new-ticket-btn"]');
    await page.waitForSelector('[role="dialog"]');
    await page.fill('#ticket-title', 'Human-created feature ticket');
    await page.fill('#ticket-desc', 'This feature was created by a human via the UI modal.');
    await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();

    await expect(
      page.locator('[data-testid="column-backlog"] [data-testid="ticket-card"]').filter({ hasText: 'Human-created feature ticket' }),
    ).toBeVisible({ timeout: 8_000 });
  });

  test('form validates: empty title shows error', async ({ page }) => {
    await login(page);
    await page.goto('/board');
    await page.waitForSelector('[data-testid="new-ticket-btn"]');
    await page.click('[data-testid="new-ticket-btn"]');
    await page.waitForSelector('[role="dialog"]');
    await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Title is required');
  });
});

test.describe('Kanban — agent ticket creation + real-time WS delivery', () => {
  test('agent POST to /api/agent/tickets appears on board without page refresh', async ({ request, page }) => {
    const { accessToken, projectId, skillId, sessionId } = await boardContext(request);

    await login(page);
    await page.goto('/board');
    await expect(page.getByText('Live updates are on')).toBeVisible();
    await expect(page.getByText(projectId)).toBeVisible();

    const ticketRes = await request.post('/api/agent/tickets', {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        projectId,
        skillId,
        sessionId,
        title: 'Agent-created realtime ticket',
        description: 'This ticket was created programmatically by an ARIA agent skill.',
        type: 'feature',
        riskClass: 'B',
      },
    });
    expect(ticketRes.status()).toBe(201);
    const { ticket } = await ticketRes.json();
    expect(ticket.status).toBe('backlog');
    expect(ticket.humanApproved).toBe(false);

    await expect(
      page.locator('[data-testid="column-backlog"] [data-testid="ticket-card"]').filter({ hasText: 'Agent-created realtime ticket' }),
    ).toBeVisible({ timeout: 8_000 });
  });

  test('agent PATCH /status moves ticket to new column in real-time', async ({ request, page }) => {
    const { accessToken, projectId, skillId, sessionId } = await boardContext(request);
    const headers = { Authorization: `Bearer ${accessToken}` };

    const createRes = await request.post('/api/agent/tickets', {
      headers,
      data: {
        projectId, skillId, sessionId,
        title: 'Ticket to be moved',
        description: 'Will be moved from backlog to ready_for_dev.',
        type: 'bug',
      },
    });
    expect(createRes.status()).toBe(201);
    const { ticket } = await createRes.json();

    await login(page);
    await page.goto('/board');
    await expect(page.getByText('Live updates are on')).toBeVisible();
    await expect(page.getByText(projectId)).toBeVisible();
    await expect(
      page.locator('[data-testid="column-backlog"] [data-testid="ticket-card"]').filter({ hasText: 'Ticket to be moved' }),
    ).toBeVisible({ timeout: 8_000 });

    const patchRes = await request.patch(`/api/agent/tickets/${ticket.id}/status`, {
      headers,
      data: { status: 'ready_for_dev', skillId },
    });
    expect(patchRes.status()).toBe(200);

    await expect(
      page.locator('[data-testid="column-ready_for_dev"] [data-testid="ticket-card"]').filter({ hasText: 'Ticket to be moved' }),
    ).toBeVisible({ timeout: 8_000 });
    await expect(
      page.locator('[data-testid="column-backlog"] [data-testid="ticket-card"]').filter({ hasText: 'Ticket to be moved' }),
    ).not.toBeVisible();
  });
});

test.describe('Kanban — human status progression', () => {
  test('clicking forward button moves ticket to next column', async ({ page }) => {
    await login(page);
    await page.goto('/board');
    await page.waitForSelector('[data-testid="new-ticket-btn"]');
    await page.click('[data-testid="new-ticket-btn"]');
    await page.fill('#ticket-title', 'Status progression test');
    await page.fill('#ticket-desc', 'Testing the forward progression button.');
    await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();

    const card = page.locator('[data-testid="column-backlog"] [data-testid="ticket-card"]').filter({ hasText: 'Status progression test' });
    await expect(card).toBeVisible({ timeout: 8_000 });
    await card.locator('[aria-label="Move to ready for dev"]').click();
    await expect(
      page.locator('[data-testid="column-ready_for_dev"] [data-testid="ticket-card"]').filter({ hasText: 'Status progression test' }),
    ).toBeVisible({ timeout: 8_000 });
  });
});
