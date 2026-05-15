import { test, expect } from '@playwright/test';

test.describe('Projects page', () => {
  test.beforeEach(async ({ page }) => {
    // Stub auth — set fake token cookie so protected route passes
    await page.goto('/');
    await page.evaluate(() => {
      document.cookie = 'aria_access_token=test; path=/';
      localStorage.setItem('aria_user', JSON.stringify({ id: '1', name: 'Test User', email: 'test@aria.dev', workspaceId: 'ws1' }));
    });
  });

  test('redirects to login when unauthenticated', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/projects');
    await expect(page).toHaveURL(/\/login/);
  });

  test('renders empty state when no projects', async ({ page }) => {
    await page.route('**/api/projects', route => route.fulfill({ json: { data: [] } }));
    await page.goto('/projects');
    await expect(page.getByText('No projects yet')).toBeVisible();
  });

  test('renders project list', async ({ page }) => {
    await page.route('**/api/projects', route => route.fulfill({
      json: { data: [{ id: '1', name: 'My App', description: 'Test', status: 'active', workspaceId: 'ws1', createdAt: '', updatedAt: '' }] },
    }));
    await page.goto('/projects');
    await expect(page.getByText('My App')).toBeVisible();
  });

  test('opens create project modal', async ({ page }) => {
    await page.route('**/api/projects', route => route.fulfill({ json: { data: [] } }));
    await page.goto('/projects');
    await page.getByRole('button', { name: /new project/i }).click();
    await expect(page.getByText('New Project')).toBeVisible();
    await expect(page.getByLabel('Project name')).toBeVisible();
  });

  test('creates a project and shows it in list', async ({ page }) => {
    const newProject = { id: '2', name: 'ARIA Core', description: '', status: 'active', workspaceId: 'ws1', createdAt: '', updatedAt: '' };
    await page.route('**/api/projects', async route => {
      if (route.request().method() === 'GET') await route.fulfill({ json: { data: [] } });
      else await route.fulfill({ status: 201, json: { data: newProject } });
    });
    await page.goto('/projects');
    await page.getByRole('button', { name: /new project/i }).first().click();
    await page.getByLabel('Project name').fill('ARIA Core');
    await page.getByRole('button', { name: /^create$/i }).click();
    await expect(page.getByText('ARIA Core')).toBeVisible();
  });
});

test.describe('GitHub OAuth', () => {
  test('login page has Continue with GitHub button', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('link', { name: /continue with github/i })).toBeVisible();
  });

  test('signup page has Continue with GitHub button', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.getByRole('link', { name: /continue with github/i })).toBeVisible();
  });

  test('GitHub button points to middleware OAuth start endpoint', async ({ page }) => {
    await page.goto('/login');
    const href = await page.getByRole('link', { name: /continue with github/i }).getAttribute('href');
    expect(href).toContain('/api/auth/github/start');
  });
});

test.describe('Project detail + repo connect', () => {
  test('shows connect repository button', async ({ page }) => {
    await page.route('**/api/projects/1', route => route.fulfill({
      json: { data: { id: '1', name: 'ARIA Core', status: 'active', workspaceId: 'ws1', createdAt: '', updatedAt: '' } },
    }));
    await page.route('**/api/projects/1/repos', route => route.fulfill({ json: { data: [] } }));
    await page.goto('/projects/1');
    await expect(page.getByRole('button', { name: /connect repository/i })).toBeVisible();
  });

  test('connect repo form appears on button click', async ({ page }) => {
    await page.route('**/api/projects/1', route => route.fulfill({
      json: { data: { id: '1', name: 'ARIA Core', status: 'active', workspaceId: 'ws1', createdAt: '', updatedAt: '' } },
    }));
    await page.route('**/api/projects/1/repos', route => route.fulfill({ json: { data: [] } }));
    await page.goto('/projects/1');
    await page.getByRole('button', { name: /connect repository/i }).click();
    await expect(page.getByText('Repository URL')).toBeVisible();
  });
});
