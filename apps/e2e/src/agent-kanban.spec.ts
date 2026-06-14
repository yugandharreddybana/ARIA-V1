import { test, expect } from '@playwright/test';

/**
 * Agent↔Kanban E2E suite.
 * Tests both human ticket creation and agent-driven ticket creation
 * with real-time WebSocket delivery to the browser.
 *
 * Preconditions (satisfied by the seed script / CI fixtures):
 *   - A user with email test@aria.dev / Test1234! exists
 *   - That user has at least one project and one skill in their workspace
 */

test.describe('Kanban — human create flow', () => {
  test('user can open modal, fill form, and see ticket in Backlog', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', 'test@aria.dev');
    await page.fill('#password', 'Test1234!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard');

    await page.goto('/tickets');
    await page.waitForSelector('[data-testid="column-backlog"]');

    await page.click('[data-testid="new-ticket-btn"]');
    await page.waitForSelector('[role="dialog"]');

    await page.fill('#ticket-title', 'Human-created feature ticket');
    await page.fill('#ticket-desc', 'This feature was created by a human via the UI modal.');

    await page.click('button[type="submit"]');

    await expect(
      page
        .locator('[data-testid="column-backlog"] [data-testid="ticket-card"]')
        .filter({ hasText: 'Human-created feature ticket' }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('form validates: empty title shows error', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', 'test@aria.dev');
    await page.fill('#password', 'Test1234!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard');

    await page.goto('/tickets');
    await page.waitForSelector('[data-testid="new-ticket-btn"]');
    await page.click('[data-testid="new-ticket-btn"]');
    await page.waitForSelector('[role="dialog"]');

    // Submit without filling title
    await page.click('button[type="submit"]');
    await expect(page.locator('[role="alert"]')).toContainText('Title is required');
  });
});

test.describe('Kanban — agent ticket creation + real-time WS delivery', () => {
  test('agent POST to /api/agent/tickets appears on board without page refresh', async ({ request, page }) => {
    // ── 1. Login ──
    const loginRes = await request.post('/api/auth/login', {
      data: { email: 'test@aria.dev', password: 'Test1234!' },
    });
    expect(loginRes.status()).toBe(200);
    const { accessToken } = await loginRes.json();

    // ── 2. Get first project ──
    const projectsRes = await request.get('/api/projects', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const { projects } = await projectsRes.json();
    expect(projects.length).toBeGreaterThan(0);
    const projectId: string = projects[0].id;

    // ── 3. Get first skill ──
    const skillsRes = await request.get(`/api/projects/${projectId}/skills`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const { skills } = await skillsRes.json();
    expect(skills.length).toBeGreaterThan(0);
    const skillId: string = skills[0].id;

    // ── 4. Navigate to tickets page and wait for board ──
    await page.goto('/login');
    await page.fill('#email', 'test@aria.dev');
    await page.fill('#password', 'Test1234!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard');
    await page.goto('/tickets');
    await page.waitForSelector('[data-testid="column-backlog"]');

    // ── 5. Agent creates ticket via API ──
    const sessionId = '11111111-2222-3333-4444-555555555555';
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
    expect(ticket.id).toBeTruthy();
    expect(ticket.status).toBe('backlog');
    expect(ticket.humanApproved).toBe(false);

    // ── 6. Ticket appears on board via WebSocket — no refresh needed ──
    await expect(
      page
        .locator('[data-testid="column-backlog"] [data-testid="ticket-card"]')
        .filter({ hasText: 'Agent-created realtime ticket' }),
    ).toBeVisible({ timeout: 6_000 });
  });

  test('agent PATCH /status moves ticket to new column in real-time', async ({ request, page }) => {
    const loginRes = await request.post('/api/auth/login', {
      data: { email: 'test@aria.dev', password: 'Test1234!' },
    });
    const { accessToken } = await loginRes.json();

    const projectsRes = await request.get('/api/projects', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const { projects } = await projectsRes.json();
    const projectId: string = projects[0].id;

    const skillsRes = await request.get(`/api/projects/${projectId}/skills`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const { skills } = await skillsRes.json();
    const skillId: string = skills[0].id;

    // Create ticket first
    const createRes = await request.post('/api/agent/tickets', {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        projectId, skillId,
        sessionId: '22222222-3333-4444-5555-666666666666',
        title: 'Ticket to be moved',
        description: 'Will be moved from backlog to ready_for_dev.',
        type: 'bug',
      },
    });
    const { ticket } = await createRes.json();

    // Navigate to tickets page
    await page.goto('/login');
    await page.fill('#email', 'test@aria.dev');
    await page.fill('#password', 'Test1234!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard');
    await page.goto('/tickets');
    await page.waitForSelector('[data-testid="column-backlog"]');

    // Agent moves ticket
    const patchRes = await request.patch(`/api/agent/tickets/${ticket.id}/status`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { status: 'ready_for_dev', skillId },
    });
    expect(patchRes.status()).toBe(200);

    // Ticket appears in ready_for_dev column in real-time
    await expect(
      page
        .locator('[data-testid="column-ready_for_dev"] [data-testid="ticket-card"]')
        .filter({ hasText: 'Ticket to be moved' }),
    ).toBeVisible({ timeout: 6_000 });

    // Ticket is gone from backlog
    await expect(
      page
        .locator('[data-testid="column-backlog"] [data-testid="ticket-card"]')
        .filter({ hasText: 'Ticket to be moved' }),
    ).not.toBeVisible();
  });
});

test.describe('Kanban — human status progression', () => {
  test('clicking forward button moves ticket to next column', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', 'test@aria.dev');
    await page.fill('#password', 'Test1234!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard');

    await page.goto('/tickets');
    await page.waitForSelector('[data-testid="new-ticket-btn"]');

    // Create a ticket first
    await page.click('[data-testid="new-ticket-btn"]');
    await page.fill('#ticket-title', 'Status progression test');
    await page.fill('#ticket-desc', 'Testing the forward progression button.');
    await page.click('button[type="submit"]');

    const card = page
      .locator('[data-testid="column-backlog"] [data-testid="ticket-card"]')
      .filter({ hasText: 'Status progression test' });
    await expect(card).toBeVisible({ timeout: 5_000 });

    // Click → ready for dev
    await card.locator('[aria-label="Move to ready for dev"]').click();
    await expect(
      page
        .locator('[data-testid="column-ready_for_dev"] [data-testid="ticket-card"]')
        .filter({ hasText: 'Status progression test' }),
    ).toBeVisible({ timeout: 3_000 });
  });
});
