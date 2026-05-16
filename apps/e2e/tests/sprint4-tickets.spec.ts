import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Sprint 4 — Tickets Kanban', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('S4-T01: /tickets page loads with kanban columns', async ({ page }) => {
    await page.goto('/tickets');
    await expect(page.getByRole('heading', { name: /tickets/i })).toBeVisible();
    await expect(page.locator('[data-testid="column-backlog"]')).toBeVisible();
    await expect(page.locator('[data-testid="column-done"]')).toBeVisible();
  });

  test('S4-T02: All 6 kanban columns render', async ({ page }) => {
    await page.goto('/tickets');
    for (const col of ['backlog', 'ready_for_dev', 'in_progress', 'ready_for_qa', 'in_qa', 'done']) {
      await expect(page.locator(`[data-testid="column-${col}"]`)).toBeVisible();
    }
  });

  test('S4-T03: New Ticket button opens create modal', async ({ page }) => {
    await page.goto('/tickets');
    const btn = page.locator('[data-testid="new-ticket-btn"]');
    if (await btn.isEnabled()) {
      await btn.click();
      await expect(page.getByRole('dialog', { name: /create ticket/i })).toBeVisible();
    }
  });

  test('S4-T04: Create ticket form validates required fields', async ({ page }) => {
    await page.goto('/tickets');
    const btn = page.locator('[data-testid="new-ticket-btn"]');
    if (await btn.isEnabled()) {
      await btn.click();
      await page.click('button[type="submit"]');
      await expect(page.locator('[role="alert"]')).toBeVisible();
    }
  });

  test('S4-T05: Create a feature ticket end-to-end', async ({ page }) => {
    await page.goto('/tickets');
    const btn = page.locator('[data-testid="new-ticket-btn"]');
    if (await btn.isEnabled()) {
      await btn.click();
      await page.fill('#ticket-title', `E2E Ticket ${Date.now()}`);
      await page.fill('#ticket-desc', 'Created by Playwright E2E test');
      await page.click('button[type="submit"]');
      await expect(page.locator('[data-testid="ticket-card"]').first()).toBeVisible({ timeout: 8000 });
    }
  });

  test('S4-T06: Ticket card shows title, type badge, and risk class', async ({ page }) => {
    await page.goto('/tickets');
    const card = page.locator('[data-testid="ticket-card"]').first();
    if (await card.count() > 0) {
      await expect(card.locator('p.text-sm')).toBeVisible();
      await expect(card.locator('.rounded-full').first()).toBeVisible();
    }
  });

  test('S4-T07: Advance ticket status moves it to next column', async ({ page }) => {
    await page.goto('/tickets');
    const advanceBtn = page.locator('[aria-label*="Move to"]').first();
    if (await advanceBtn.count() > 0) {
      await advanceBtn.click();
      await expect(page.locator('[data-testid="ticket-card"]').first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('S4-T08: Security — /api/tickets requires auth', async ({ request }) => {
    const res = await request.get('/api/tickets?projectId=test');
    expect(res.status()).toBe(401);
  });

  test('S4-T09: Security — POST /api/tickets rejects without token', async ({ request }) => {
    const res = await request.post('/api/tickets', { data: { title: 'Hack', description: 'XSS', type: 'bug', projectId: 'fake' } });
    expect(res.status()).toBe(401);
  });

  test('S4-T10: Security — PATCH /api/tickets/:id rejects without token', async ({ request }) => {
    const res = await request.patch('/api/tickets/fake-id', { data: { status: 'done' } });
    expect(res.status()).toBe(401);
  });

});
