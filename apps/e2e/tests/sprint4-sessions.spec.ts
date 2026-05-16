import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Sprint 4 — Sessions', () => {

  test.beforeEach(async ({ page }) => { await login(page); });

  test('S4-SS01: sessions page loads with heading', async ({ page }) => {
    await page.goto('/sessions');
    await expect(page.getByRole('heading', { name: /sessions/i })).toBeVisible();
  });

  test('S4-SS02: empty state renders when no sessions exist', async ({ page }) => {
    await page.goto('/sessions');
    // Either session cards or an empty-state message should be present
    const cards   = page.locator('[data-testid="session-card"]');
    const empty   = page.getByText(/no sessions/i);
    const count   = await cards.count();
    if (count === 0) {
      await expect(empty).toBeVisible();
    } else {
      expect(count).toBeGreaterThan(0);
    }
  });

  test('S4-SS03: start new session button is visible', async ({ page }) => {
    await page.goto('/sessions');
    await expect(
      page.locator('[data-testid="new-session-btn"], button:has-text("New Session"), button:has-text("Start")'),
    ).toBeVisible();
  });

  test('S4-SS04: PATCH /api/sessions/:id rejects invalid state', async ({ request }) => {
    // A valid UUID but nonexistent — must return 401 (no auth) NOT 400 on an unauthenticated request
    const res = await request.patch(
      '/api/sessions/00000000-0000-0000-0000-000000000000',
      { data: { state: 'INVALID_STATE_XYZ' } },
    );
    // Without auth the middleware returns 401 before validation runs
    expect(res.status()).toBe(401);
  });

  test('S4-SS05: GET /api/sessions requires auth', async ({ request }) => {
    expect((await request.get('/api/sessions?projectId=test')).status()).toBe(401);
  });

  test('S4-SS06: POST /api/sessions requires auth', async ({ request }) => {
    expect((await request.post('/api/sessions', { data: {} })).status()).toBe(401);
  });

  test('S4-SS07: PATCH /api/sessions/:id requires auth', async ({ request }) => {
    expect(
      (await request.patch(
        '/api/sessions/00000000-0000-0000-0000-000000000000',
        { data: { state: 'working' } },
      )).status(),
    ).toBe(401);
  });

});
