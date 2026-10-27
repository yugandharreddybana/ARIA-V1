import { expect, test } from '@playwright/test';

test('signup shows the field message when the name is too short', async ({ page }) => {
  const email = `short-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@aria.dev`;
  await page.goto('/signup');
  await page.fill('[name="name"]', 'A');
  await page.fill('[name="email"]', email);
  await page.fill('[name="password"]', 'Test1234!');
  await page.fill('[name="confirm"]', 'Test1234!');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)').first()).toContainText(/at least 2 characters/i);
});
