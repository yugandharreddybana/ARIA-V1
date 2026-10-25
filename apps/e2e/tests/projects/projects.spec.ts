import { test, expect, type Page } from '@playwright/test';

async function stubSession(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('aria_token', 'e2e-stub-token'));
  await page.route('**/api/auth/me', route => route.fulfill({
    json: { user: { id: '1', name: 'Test User', email: 'test@aria.dev', workspaceId: 'ws1' } },
  }));
}

test.describe('Projects page', () => {
  test('redirects to login when unauthenticated', async ({ page }) => {
    await page.goto('/projects');
    await expect(page).toHaveURL(/\/login/);
  });

  test('renders empty state when no projects', async ({ page }) => {
    await stubSession(page);
    // API returns { projects: [] } — not { data: [] }
    await page.route('**/api/projects', route => route.fulfill({ json: { projects: [] } }));
    await page.goto('/projects');
    await expect(page.getByText('No projects yet')).toBeVisible();
  });

  test('renders project list', async ({ page }) => {
    await stubSession(page);
    await page.route('**/api/projects', route => route.fulfill({
      // API returns { projects: [...] } — not { data: [...] }
      json: { projects: [{ id: '1', name: 'My App', description: 'Test', status: 'active', workspaceId: 'ws1', createdAt: '', updatedAt: '' }] },
    }));
    await page.goto('/projects');
    await expect(page.getByText('My App')).toBeVisible();
  });

  test('opens create project modal', async ({ page }) => {
    await stubSession(page);
    await page.route('**/api/projects', route => route.fulfill({ json: { projects: [] } }));
    await page.goto('/projects');
    await page.getByRole('button', { name: /new project/i }).click();
    await expect(page.getByRole('heading', { name: 'New project' })).toBeVisible();
    // Modal label is "Name" (htmlFor="pname") — not "Project name"
    await expect(page.getByLabel('Name')).toBeVisible();
  });

  test('creates a project and shows it in list', async ({ page }) => {
    await stubSession(page);
    const newProject = { id: '2', name: 'ARIA Core', description: '', status: 'active', workspaceId: 'ws1', createdAt: '', updatedAt: '' };
    await page.route('**/api/projects', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: { projects: [] } });
      } else {
        // POST returns { project: {...} } — matches api<{ project: Project }>('/projects', ...)
        await route.fulfill({ status: 201, json: { project: newProject } });
      }
    });
    await page.goto('/projects');
    await page.getByRole('button', { name: /new project/i }).first().click();
    // Modal label is "Name" — not "Project name"
    await page.getByLabel('Name').fill('ARIA Core');
    await page.getByRole('button', { name: /^create$/i }).click();
    await expect(page.getByText('ARIA Core')).toBeVisible();
  });
});

test.describe('GitHub OAuth', () => {
  test('login page has Continue with GitHub button', async ({ page }) => {
    await page.goto('/login');
    // Rendered as <a><span>Continue with GitHub</span></a> — use getByText
    await expect(page.getByText(/continue with github/i)).toBeVisible();
  });

  test('signup page has Continue with GitHub button', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.getByText(/continue with github/i)).toBeVisible();
  });

  test('GitHub button points to middleware OAuth start endpoint', async ({ page }) => {
    await page.goto('/login');
    // The GitHub button is an <a> tag wrapping a <Button asChild>
    const href = await page.locator('a[href*="github/start"]').getAttribute('href');
    expect(href).toContain('/api/auth/github/start');
  });
});

test.describe('Project detail + repo connect', () => {
  test('shows connect repo button on project detail page', async ({ page }) => {
    await stubSession(page);
    await page.route('**/api/projects/1', route => route.fulfill({
      json: { project: { id: '1', name: 'ARIA Core', status: 'active', workspaceId: 'ws1', repos: [], createdAt: '', updatedAt: '' } },
    }));
    await page.route('**/api/analysis/jobs**', route => route.fulfill({ json: { jobs: [] } }));
    await page.goto('/projects/1');
    // Button renders as "Connect Repo" (not "Connect Repository")
    await expect(page.getByRole('button', { name: /connect repo/i })).toBeVisible();
  });

  test('connect repo modal appears on button click', async ({ page }) => {
    await stubSession(page);
    await page.route('**/api/projects/1', route => route.fulfill({
      json: { project: { id: '1', name: 'ARIA Core', status: 'active', workspaceId: 'ws1', repos: [], createdAt: '', updatedAt: '' } },
    }));
    await page.route('**/api/analysis/jobs**', route => route.fulfill({ json: { jobs: [] } }));
    await page.goto('/projects/1');
    await page.getByRole('button', { name: /connect repo/i }).click();
    // Modal title and label verified against ConnectRepoModal in [id]/page.tsx
    await expect(page.getByRole('heading', { name: 'Connect repository' })).toBeVisible();
    await expect(page.getByLabel('GitHub repository URL')).toBeVisible();
  });
});
