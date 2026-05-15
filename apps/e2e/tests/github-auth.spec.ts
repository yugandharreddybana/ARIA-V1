import { test, expect } from '@playwright/test';

test.describe('GitHub OAuth flow', () => {
  test('login page shows Continue with GitHub button', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: /continue with github/i })
      .or(page.getByText(/continue with github/i))).toBeVisible();
  });

  test('github start endpoint redirects to github.com', async ({ request }) => {
    const MIDDLEWARE = process.env.MIDDLEWARE_URL ?? 'http://localhost:3001';
    const res = await request.get(`${MIDDLEWARE}/api/auth/github/start`, { maxRedirects: 0 });
    // Expect a redirect (302/301) to GitHub
    expect([301, 302]).toContain(res.status());
    const location = res.headers()['location'] ?? '';
    expect(location).toContain('github.com/login/oauth/authorize');
  });

  test('callback page handles missing token gracefully', async ({ page }) => {
    await page.goto('/auth/callback');
    // Should redirect to login with an error
    await page.waitForURL(/\/login/);
    expect(page.url()).toContain('/login');
  });
});
