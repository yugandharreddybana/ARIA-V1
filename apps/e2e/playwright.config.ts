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
 * Credentials for authenticated tests are set via:
 *   E2E_EMAIL, E2E_PASSWORD, E2E_NAME environment variables.
 *   If not set, defaults from helpers/auth.ts are used (test@aria.dev / Test1234!).
 */
export default defineConfig({
  testDir: './tests',

  // Run all test files in parallel for speed
  fullyParallel: true,

  // Fail the build on CI if test.only is accidentally committed
  forbidOnly: !!process.env.CI,

  // Retry twice on CI to handle flakiness; no retries locally
  retries: process.env.CI ? 2 : 0,

  // 1 worker on CI to avoid port conflicts; auto-detect locally
  workers: process.env.CI ? 1 : undefined,

  reporter: process.env.CI ? 'github' : 'html',

  use: {
    // Override with BASE_URL env var — defaults to local dev server
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',

    // API calls in request fixtures go to the middleware directly
    // Override with API_URL env var
    extraHTTPHeaders: {
      'x-e2e-test': '1',
    },

    // Capture traces and screenshots only on failure to keep CI artifacts small
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',

    // Generous action timeout for slow CI environments
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Uncomment to add cross-browser coverage:
    // { name: 'firefox',       use: { ...devices['Desktop Firefox'] } },
    // { name: 'webkit',        use: { ...devices['Desktop Safari'] } },
    // { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] } },
  ],
});
