import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for ARIA.
 *
 * Run locally:
 *   BASE_URL=http://localhost:3000 npx playwright test
 *
 * CI usage:
 *   BASE_URL=https://staging.aria.dev npx playwright test --reporter=github
 *
 * Sprint 6 (V27.9 §13) adds the device matrix per spec — every UI spec runs
 * across desktop (1920×1080), tablet (768×1024), and mobile (375×667).
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'html',

  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    extraHTTPHeaders: { 'x-e2e-test': '1' },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
    {
      name: 'chromium-tablet',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 }, isMobile: false },
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 667 }, isMobile: true },
    },
  ],
});
