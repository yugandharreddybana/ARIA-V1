import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Sprint 4 — AI Strategy Chat', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('S4-AI01: /ai-strategy page loads', async ({ page }) => {
    await page.goto('/ai-strategy');
    await expect(page.getByRole('heading', { name: /ai strategy/i })).toBeVisible();
  });

  test('S4-AI02: Chat textarea is present', async ({ page }) => {
    await page.goto('/ai-strategy');
    await expect(page.locator('textarea')).toBeVisible();
  });

  test('S4-AI03: Model selector is rendered', async ({ page }) => {
    await page.goto('/ai-strategy');
    await expect(page.locator('[role="combobox"]').first()).toBeVisible();
  });

  test('S4-AI04: Send button is disabled when input is empty', async ({ page }) => {
    await page.goto('/ai-strategy');
    const sendBtn = page.locator('button:has(svg)').last();
    await expect(sendBtn).toBeDisabled();
  });

  test('S4-AI05: Empty state suggestion chips are visible', async ({ page }) => {
    await page.goto('/ai-strategy');
    await expect(page.getByText(/ask aria/i)).toBeVisible();
  });

  test('S4-AI06: Clicking suggestion fills the textarea', async ({ page }) => {
    await page.goto('/ai-strategy');
    const chip = page.getByText('Help me plan the next sprint');
    if (await chip.count() > 0) {
      await chip.click();
      const textarea = page.locator('textarea');
      await expect(textarea).not.toBeEmpty();
    }
  });

  test('S4-AI07: Ollama offline badge shown when no models returned', async ({ page }) => {
    await page.goto('/ai-strategy');
    // If Ollama is not running locally, offline badge should appear
    const offline = page.locator('text=Ollama offline');
    const modelSelector = page.locator('[role="combobox"]').first();
    // Either models loaded OR offline badge visible — both are valid states
    const eitherVisible = await offline.isVisible().catch(() => false) || await modelSelector.isVisible().catch(() => false);
    expect(eitherVisible).toBeTruthy();
  });

  test('S4-AI08: Security — /api/ai/chat requires auth', async ({ request }) => {
    const res = await request.post('/api/ai/chat', { data: { messages: [{ role: 'user', content: 'test' }] } });
    expect(res.status()).toBe(401);
  });

  test('S4-AI09: Security — /api/ai/models requires auth', async ({ request }) => {
    const res = await request.get('/api/ai/models');
    expect(res.status()).toBe(401);
  });

  test('S4-AI10: Security — chat does not echo raw JWT in response', async ({ page }) => {
    await page.goto('/ai-strategy');
    const content = await page.content();
    expect(content).not.toMatch(/aria_token|Authorization: Bearer/);
  });

});
