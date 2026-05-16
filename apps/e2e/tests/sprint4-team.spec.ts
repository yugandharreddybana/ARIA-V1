import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Sprint 4 — Team and Skills', () => {

  test.beforeEach(async ({ page }) => { await login(page); });

  test('S4-TM01: team or skills page loads', async ({ page }) => {
    await page.goto('/team');
    await expect(
      page.getByRole('heading', { name: /team|skills|members/i }),
    ).toBeVisible();
  });

  test('S4-TM02: skill cards or empty state rendered', async ({ page }) => {
    await page.goto('/team');
    const cards = page.locator('[data-testid="skill-card"]');
    const empty = page.getByText(/no skills|no members/i);
    if (await cards.count() === 0) {
      await expect(empty).toBeVisible();
    } else {
      expect(await cards.count()).toBeGreaterThan(0);
    }
  });

  test('S4-TM03: add skill button is visible', async ({ page }) => {
    await page.goto('/team');
    await expect(
      page.locator('[data-testid="add-skill-btn"], button:has-text("Add Skill"), button:has-text("New Skill")'),
    ).toBeVisible();
  });

  test('S4-TM04: GET /api/projects/:id/skills requires auth', async ({ request }) => {
    expect(
      (await request.get('/api/projects/00000000-0000-0000-0000-000000000000/skills')).status(),
    ).toBe(401);
  });

  test('S4-TM05: POST /api/projects/:id/skills requires auth', async ({ request }) => {
    expect(
      (await request.post(
        '/api/projects/00000000-0000-0000-0000-000000000000/skills',
        { data: { name: 'test', type: 'frontend' } },
      )).status(),
    ).toBe(401);
  });

});
