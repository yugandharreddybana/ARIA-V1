import { Page } from '@playwright/test';

// Credentials read from env so CI can inject real test-user creds
export const TEST_EMAIL    = process.env.E2E_EMAIL    ?? 'test@aria.dev';
export const TEST_PASSWORD = process.env.E2E_PASSWORD ?? 'Test1234!';
export const TEST_NAME     = process.env.E2E_NAME     ?? 'E2E Tester';

/**
 * Log in via the UI and wait until the dashboard or projects page is reached.
 * Re-used by every spec that requires an authenticated session.
 */
export async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.waitForSelector('[name="email"]', { timeout: 10_000 });
  await page.fill('[name="email"]', TEST_EMAIL);
  await page.fill('[name="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|projects)/, { timeout: 15_000 });
}

/**
 * Alias used by older specs (dashboard.spec.ts, projects.spec.ts).
 * Identical to `login` — both names are exported so either can be used.
 */
export async function loginAsTestUser(page: Page): Promise<void> {
  return login(page);
}

/**
 * Sign up via the UI. Uses a unique email so tests don't collide.
 * Returns the generated email so tests can reference it later.
 */
export async function signup(
  page: Page,
  overrides?: { name?: string; email?: string; password?: string },
): Promise<{ email: string; password: string }> {
  const email    = overrides?.email    ?? `e2e+${Date.now()}@aria.dev`;
  const password = overrides?.password ?? TEST_PASSWORD;
  const name     = overrides?.name     ?? TEST_NAME;
  await page.goto('/signup');
  await page.waitForSelector('[name="name"]', { timeout: 10_000 });
  await page.fill('[name="name"]',     name);
  await page.fill('[name="email"]',    email);
  await page.fill('[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  return { email, password };
}

/**
 * Create a project via the UI Projects page.
 * Navigates to /projects, opens the create modal, fills in the name, submits,
 * and waits for the new project card to appear before returning.
 */
export async function createProject(page: Page, name: string): Promise<void> {
  await page.goto('/projects');
  await page.waitForSelector('button', { timeout: 10_000 });
  await page.getByRole('button', { name: /new project/i }).click();
  await page.waitForSelector('[id="pname"], [name="name"], input[placeholder*="project" i]', { timeout: 5_000 });
  // Fill whichever name input is present
  const nameInput = page.locator('[id="pname"]').or(page.locator('input[placeholder*="platform" i]')).first();
  await nameInput.fill(name);
  await page.getByRole('button', { name: /^create$/i }).click();
  // Wait for the project card to appear in the list
  await page.waitForSelector(`text=${name}`, { timeout: 10_000 });
}

/**
 * Delete a project via the UI (best-effort — no-op if the project is not found).
 * Navigates to /projects and removes the project by name if a delete button exists.
 * Most current project cards don't expose a delete button so this is a graceful no-op.
 */
export async function deleteProject(page: Page, name: string): Promise<void> {
  await page.goto('/projects');
  // Attempt to find a delete / archive button near the project card
  const card = page.locator(`text=${name}`).first();
  if (await card.count() === 0) return; // already gone
  const deleteBtn = card
    .locator('xpath=ancestor::*[contains(@class,"card") or contains(@class,"Card")][1]')
    .getByRole('button', { name: /delete|archive|remove/i });
  if (await deleteBtn.count() > 0) {
    await deleteBtn.click();
    // Wait for card to disappear
    await card.waitFor({ state: 'detached', timeout: 5_000 }).catch(() => {});
  }
  // If no delete button exists the project stays — tests should not depend on clean-up
}
