import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Sprint 3 — Analysis & Dashboard', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('S3-01: Projects home loads', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.getByRole('heading', { name: /^projects$/i })).toBeVisible();
    await expect(page.locator('main').getByText(/no projects yet|repositories/i).first()).toBeVisible();
  });

  test('S3-02: Runs page shows activity', async ({ page }) => {
    await page.goto('/runs');
    await expect(page.getByRole('heading', { name: /^runs$/i })).toBeVisible();
    await expect(page.getByText(/no agent runs yet|no sessions/i).first()).toBeVisible();
  });

  test('S3-03: Concept graph page loads with ReactFlow canvas', async ({ page }) => {
    await page.goto('/projects');
    const firstProject = page.locator('a[href*="/projects/"]').first();
    if (await firstProject.count() > 0) {
      await firstProject.click();
      const graphLink = page.locator('a[href*="/graph"]').first();
      if (await graphLink.count() > 0) {
        await graphLink.click();
        await expect(page.locator('.react-flow, [data-testid="rf__wrapper"]')).toBeVisible({ timeout: 10000 });
      }
    }
  });

  test('S3-04: Analysis job history list renders', async ({ page }) => {
    await page.goto('/projects');
    const firstProject = page.locator('a[href*="/projects/"]').first();
    if (await firstProject.count() > 0) {
      await firstProject.click();
      await expect(page.locator('text=Analysis, text=Jobs').first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('S3-05: Security — /api/analysis/jobs requires auth', async ({ request }) => {
    const res = await request.get('/api/analysis/jobs');
    expect(res.status()).toBe(401);
  });

  test('S3-06: Security — /api/graph requires auth', async ({ request }) => {
    const res = await request.get('/api/graph');
    expect(res.status()).toBe(401);
  });

});
