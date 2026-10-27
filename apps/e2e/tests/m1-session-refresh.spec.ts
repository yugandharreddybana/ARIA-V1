import { expect, test } from '@playwright/test';

test('an unusable access token is replaced from the refresh cookie', async ({ page }) => {
  const email = `refresh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@aria.dev`;
  await page.goto('/signup');
  await page.fill('[name="name"]', 'Refresh Owner');
  await page.fill('[name="email"]', email);
  await page.fill('[name="password"]', 'Test1234!');
  await page.fill('[name="confirm"]', 'Test1234!');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByTestId('setup-project-name').waitFor();

  const before = await page.evaluate(() => localStorage.getItem('aria_token'));
  expect(before).toBeTruthy();

  await page.evaluate(() => localStorage.setItem('aria_token', 'not-a-jwt'));
  const refresh = page.waitForResponse(
    (res) => res.url().includes('/api/auth/refresh') && res.request().method() === 'POST',
    { timeout: 20000 },
  );
  const me = page.waitForResponse(
    (res) => res.url().includes('/api/auth/me') && res.request().method() === 'GET' && res.ok(),
    { timeout: 20000 },
  );
  await page.goto('/projects');
  const refreshResponse = await refresh;
  expect(refreshResponse.ok()).toBeTruthy();
  await me;
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
  await expect(page).toHaveURL(/\/projects/);

  const after = await page.evaluate(() => localStorage.getItem('aria_token'));
  expect(after).toBeTruthy();
  expect(after).not.toBe('not-a-jwt');
  expect(after).not.toBe(before);
});
