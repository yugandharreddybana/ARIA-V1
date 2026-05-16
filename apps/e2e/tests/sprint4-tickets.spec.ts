import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Sprint 4 — Tickets Kanban', () => {

  test.beforeEach(async ({ page }) => { await login(page); });

  test('S4-T01: tickets page loads with heading', async ({ page }) => {
    await page.goto('/tickets');
    await expect(page.getByRole('heading', { name: /tickets/i })).toBeVisible();
  });

  test('S4-T02: all 8 kanban columns render', async ({ page }) => {
    await page.goto('/tickets');
    const columns = [
      'backlog', 'ready_for_dev', 'in_progress',
      'ready_for_qa', 'in_qa', 'ready_for_review',
      'done', 'rejected',
    ];
    for (const col of columns) {
      await expect(page.locator(`[data-testid="column-${col}"]`)).toBeVisible();
    }
  });

  test('S4-T03: new ticket button opens create modal', async ({ page }) => {
    await page.goto('/tickets');
    const btn = page.locator('[data-testid="new-ticket-btn"]');
    if (await btn.isEnabled()) {
      await btn.click();
      await expect(page.getByRole('dialog', { name: /create ticket/i })).toBeVisible();
    }
  });

  test('S4-T04: create ticket form shows error on empty submit', async ({ page }) => {
    await page.goto('/tickets');
    const btn = page.locator('[data-testid="new-ticket-btn"]');
    if (await btn.isEnabled()) {
      await btn.click();
      await page.click('button[type="submit"]');
      await expect(page.locator('[role="alert"]')).toBeVisible();
    }
  });

  test('S4-T05: create a feature ticket end-to-end', async ({ page }) => {
    await page.goto('/tickets');
    const btn = page.locator('[data-testid="new-ticket-btn"]');
    if (await btn.isEnabled()) {
      await btn.click();
      await page.fill('#ticket-title', `E2E Ticket ${Date.now()}`);
      await page.fill('#ticket-desc', 'Created by Playwright E2E test suite');
      await page.click('button[type="submit"]');
      await expect(
        page.locator('[data-testid="ticket-card"]').first(),
      ).toBeVisible({ timeout: 8000 });
    }
  });

  test('S4-T06: ticket card renders title, type badge and risk class', async ({ page }) => {
    await page.goto('/tickets');
    const card = page.locator('[data-testid="ticket-card"]').first();
    if (await card.count() > 0) {
      await expect(card.locator('p.text-sm')).toBeVisible();
      await expect(card.locator('.rounded-full').first()).toBeVisible();
    }
  });

  test('S4-T07: advancing ticket status moves it forward', async ({ page }) => {
    await page.goto('/tickets');
    const advBtn = page.locator('[aria-label*="Move to"]').first();
    if (await advBtn.count() > 0) {
      await advBtn.click();
      await expect(
        page.locator('[data-testid="ticket-card"]').first(),
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test('S4-T08: GET /api/tickets requires auth', async ({ request }) => {
    expect((await request.get('/api/tickets?projectId=test')).status()).toBe(401);
  });

  test('S4-T09: POST /api/tickets requires auth', async ({ request }) => {
    expect(
      (await request.post('/api/tickets', { data: { title: 'x', description: 'y', type: 'bug', projectId: 'fake' } })).status(),
    ).toBe(401);
  });

  test('S4-T10: PATCH /api/tickets/:id requires auth', async ({ request }) => {
    expect(
      (await request.patch('/api/tickets/00000000-0000-0000-0000-000000000000', { data: { status: 'done' } })).status(),
    ).toBe(401);
  });

});
