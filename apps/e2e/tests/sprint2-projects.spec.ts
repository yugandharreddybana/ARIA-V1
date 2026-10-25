import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Sprint 2 — Projects & Repo Connection', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('S2-01: /projects page loads and shows header', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.getByRole('heading', { name: /projects/i })).toBeVisible();
  });

  test('S2-02: Create project button is visible', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible();
  });

  test('S2-03: Create a project and verify it appears in list', async ({ page }) => {
    await page.goto('/projects');
    await page.getByRole('button', { name: 'New Project' }).click();
    await page.locator('#pname').fill(`E2E Project ${Date.now()}`);
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('[data-testid="project-card"], .project-card').first()).toBeVisible({ timeout: 8000 });
  });

  test('S2-04: Project detail page loads', async ({ page }) => {
    await page.goto('/projects');
    const firstProject = page.locator('a[href*="/projects/"]').first();
    if (await firstProject.count() > 0) {
      await firstProject.click();
      await expect(page.getByRole('heading')).toBeVisible();
    }
  });

  test('S2-05: Connect repo button visible on project detail', async ({ page }) => {
    await page.goto('/projects');
    const firstProject = page.locator('a[href*="/projects/"]').first();
    if (await firstProject.count() > 0) {
      await firstProject.click();
      await expect(page.getByRole('button', { name: 'Connect Repo' })).toBeVisible();
    }
  });

  test('S2-06: Security — /api/projects requires auth (returns 401 without token)', async ({ request }) => {
    const res = await request.get('/api/projects');
    expect(res.status()).toBe(401);
  });

});
