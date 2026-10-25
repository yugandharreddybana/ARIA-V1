import { test, expect } from '@playwright/test';
import { loginAsTestUser, createProject, signup } from './helpers/auth';

test.describe('Projects', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test('shows empty state when no projects exist', async ({ page }) => {
    await signup(page);
    await page.goto('/projects');
    await expect(page.getByText('No projects yet')).toBeVisible();
  });

  test('creates a new project', async ({ page }) => {
    const projectName = `E2E Test Project ${Date.now()}`;
    await page.goto('/projects');
    await page.getByRole('button', { name: /new project/i }).click();
    await page.getByLabel('Name').fill(projectName);
    await page.getByLabel(/description/i).fill('Created by E2E test');
    await page.getByRole('button', { name: /create/i }).last().click();
    await expect(page.getByText(projectName)).toBeVisible();
  });

  test('navigates to project detail', async ({ page }) => {
    const projectName = `E2E Project ${Date.now()}`;
    await createProject(page, projectName);
    await page.getByText(projectName).click();
    await expect(page.getByRole('heading', { name: 'Connected repositories' })).toBeVisible();
    await expect(page.getByRole('button', { name: /connect repo/i })).toBeVisible();
  });

  test('connects a repository to a project', async ({ page }) => {
    const projectName = `Repo Test ${Date.now()}`;
    await createProject(page, projectName);
    await page.getByText(projectName).click();
    await page.getByRole('button', { name: /connect repo/i }).click();
    await page.getByLabel(/repository url/i).fill('https://github.com/yugandharreddybana/ARIA-V1');
    await page.getByLabel(/branch/i).fill('main');
    await page.getByRole('button', { name: /^connect$/i }).click();
    await expect(page.getByText('ARIA-V1', { exact: true }).first()).toBeVisible();
  });

  test('shows error for invalid repo URL', async ({ page }) => {
    const projectName = `Invalid Repo ${Date.now()}`;
    await createProject(page, projectName);
    await page.getByText(projectName).click();
    await page.getByRole('button', { name: /connect repo/i }).click();
    await page.getByLabel(/repository url/i).fill('not-a-valid-url');
    await page.getByRole('button', { name: /^connect$/i }).click();
    await expect(page.getByRole('alert', { hidden: true }).or(page.locator('.text-destructive'))).toBeVisible();
  });
});
