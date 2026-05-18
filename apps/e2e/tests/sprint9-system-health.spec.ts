/**
 * Sprint 9 — System Health page renders the queue card + incidents list.
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test('S9-04 dashboard exposes the system-health page', async ({ page }) => {
  await login(page);
  await page.goto('/system-health');
  await expect(page.getByTestId('system-health-page')).toBeVisible();
  await expect(page.getByTestId('queue-card')).toBeVisible();
  await expect(page.getByTestId('incidents-card')).toBeVisible();
});
