import { Page } from '@playwright/test';

// Credentials read from env so CI can inject real test-user creds
export const TEST_EMAIL    = process.env.E2E_EMAIL    ?? 'test@aria.dev';
export const TEST_PASSWORD = process.env.E2E_PASSWORD ?? 'Test1234!';
export const TEST_NAME     = process.env.E2E_NAME     ?? 'E2E Tester';

/**
 * Log in via the UI and wait until the dashboard or projects page is reached.
 * Re-used by every spec that requires an authenticated session.
 */
let seeded: Promise<void> | null = null;

async function ensureTestUser(): Promise<void> {
  if (!seeded) {
    seeded = (async () => {
      const base = process.env.NEXT_PUBLIC_MIDDLEWARE_URL ?? 'http://127.0.0.1:3001';
      const res = await fetch(`${base}/api/auth/signup`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: TEST_NAME, email: TEST_EMAIL, password: TEST_PASSWORD }),
      });
      if (res.status !== 201 && res.status !== 409) {
        throw new Error(`Could not seed ${TEST_EMAIL}: HTTP ${res.status}`);
      }
    })();
  }
  await seeded;
}

export async function revealNav(page: Page): Promise<void> {
  const projects = page.locator('aside').getByRole('link', { name: /^projects$/i });
  try {
    await projects.waitFor({ state: 'visible', timeout: 3_000 });
    return;
  } catch {
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await projects.waitFor({ state: 'visible' });
  }
}

export async function login(page: Page): Promise<void> {
  await ensureTestUser();
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
  const confirm = page.locator('[name="confirm"]');
  if (await confirm.count()) await confirm.fill(password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(setup|projects|dashboard)/, { timeout: 15_000 });
  return { email, password };
}

/**
 * Create a project via the UI Projects page.
 * Navigates to /projects, opens the create modal, fills in the name, submits,
 * and waits for the new project card to appear before returning.
 */
export async function createProject(page: Page, name: string): Promise<void> {
  await page.goto('/projects');
  await page.getByRole('button', { name: /new project/i }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();
  await page.getByText(name, { exact: true }).first().waitFor({ timeout: 10_000 });
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
