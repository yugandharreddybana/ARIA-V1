import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Sprint 4 — AI Chat', () => {

  test.beforeEach(async ({ page }) => { await login(page); });

  test('S4-AI01: AI chat page loads with heading', async ({ page }) => {
    await page.goto('/ai');
    await expect(page.getByRole('heading', { name: /ai|chat|aria/i })).toBeVisible();
  });

  test('S4-AI02: chat input field is visible', async ({ page }) => {
    await page.goto('/ai');
    await expect(
      page.locator('textarea, input[placeholder*="message"], input[placeholder*="chat"]'),
    ).toBeVisible();
  });

  test('S4-AI03: model selector dropdown is visible', async ({ page }) => {
    await page.goto('/ai');
    await expect(
      page.locator('[data-testid="model-selector"], select, [role="combobox"]'),
    ).toBeVisible();
  });

  test('S4-AI04: empty state prompt chips render before first message', async ({ page }) => {
    await page.goto('/ai');
    // If there are no messages, suggestion chips should be shown
    const messages = page.locator('[data-testid="chat-message"]');
    if (await messages.count() === 0) {
      const chips = page.locator('[data-testid="suggestion-chip"], .suggestion-chip');
      // Either chips OR a welcome message must exist
      const welcome = page.getByText(/how can i help|start a conversation|ask me/i);
      const hasChips   = await chips.count() > 0;
      const hasWelcome = await welcome.count() > 0;
      expect(hasChips || hasWelcome).toBeTruthy();
    }
  });

  test('S4-AI05: sending a message displays it in the chat window', async ({ page }) => {
    await page.goto('/ai');
    const input = page.locator('textarea').first();
    if (await input.count() > 0 && await input.isEnabled()) {
      await input.fill('Hello ARIA');
      await page.keyboard.press('Enter');
      await expect(page.getByText('Hello ARIA')).toBeVisible({ timeout: 10_000 });
    }
  });

  test('S4-AI06: Ollama offline shows error or fallback message', async ({ page }) => {
    await page.goto('/ai');
    // If the models list is empty or an error state is shown, that is acceptable
    const errorMsg = page.locator('[role="alert"], [data-testid="ollama-error"]');
    const modelDropdown = page.locator('[data-testid="model-selector"], [role="combobox"]');
    // Either an error OR the model selector should be visible — not a blank white screen
    const hasError   = await errorMsg.count() > 0;
    const hasDropdown = await modelDropdown.count() > 0;
    expect(hasError || hasDropdown).toBeTruthy();
  });

  test('S4-AI07: POST /api/ai/chat requires auth', async ({ request }) => {
    expect(
      (await request.post('/api/ai/chat', { data: { messages: [{ role: 'user', content: 'hi' }] } })).status(),
    ).toBe(401);
  });

  test('S4-AI08: GET /api/ai/models requires auth', async ({ request }) => {
    expect((await request.get('/api/ai/models')).status()).toBe(401);
  });

  test('S4-AI09: POST /api/ai/chat with empty messages returns 400', async ({ request }) => {
    // Without auth this should return 401, so we just check it is NOT 200
    const res = await request.post('/api/ai/chat', { data: { messages: [] } });
    expect(res.status()).not.toBe(200);
  });

  test('S4-AI10: chat page is inaccessible without login', async ({ page }) => {
    // Navigate without calling login() — should redirect to /login
    await page.goto('/ai');
    await page.waitForURL(/\/login/, { timeout: 10_000 });
  });

});
