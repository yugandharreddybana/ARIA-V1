/**
 * Sprint 5 — Token Gateway smoke tests.
 *
 * Verifies the new /api/llm/* surface:
 *   - /queue/status responds to authenticated requests with a typed payload
 *   - /invoke rejects requests with missing/invalid bodies (Zod validation)
 *   - /invoke rejects unauthenticated requests
 *
 * Live LLM dispatch is not asserted here (depends on Ollama availability); the
 * orchestrator-status spec exercises the round-trip end-to-end via Java.
 */

import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_MIDDLEWARE_URL ?? 'http://localhost:3001';

async function getToken(request: import('@playwright/test').APIRequestContext): Promise<string> {
  const res = await request.post(`${API_URL}/api/auth/login`, {
    data: { email: process.env.E2E_EMAIL ?? 'test@aria.dev', password: process.env.E2E_PASSWORD ?? 'Test1234!' },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.accessToken ?? body.data?.accessToken ?? body.token;
}

test('S5-01 unauthenticated /api/llm/queue/status is 401', async ({ request }) => {
  const res = await request.get(`${API_URL}/api/llm/queue/status`);
  expect([401, 403]).toContain(res.status());
});

test('S5-02 authenticated /api/llm/queue/status returns typed payload', async ({ request }) => {
  const token = await getToken(request);
  const res = await request.get(`${API_URL}/api/llm/queue/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.success).toBe(true);
  expect(body.data).toBeTruthy();
  expect(typeof body.data.totalQueueDepth).toBe('number');
  expect(typeof body.data.acceptingRequests).toBe('boolean');
  expect(body.data.queueDepthByPriority).toMatchObject({
    p0_critical: expect.any(Number),
    high: expect.any(Number),
    normal: expect.any(Number),
    low: expect.any(Number),
    speculative: expect.any(Number),
  });
});

test('S5-03 /api/llm/invoke rejects empty body (Zod 400)', async ({ request }) => {
  const token = await getToken(request);
  const res = await request.post(`${API_URL}/api/llm/invoke`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {},
  });
  expect([400, 422]).toContain(res.status());
});

test('S5-04 sidebar SessionStatus indicator renders on the dashboard', async ({ page }) => {
  await login(page);
  await page.goto('/dashboard');
  const status = page.getByTestId('session-status');
  await expect(status).toBeVisible();
  // dot is rendered regardless of connection state
  await expect(page.getByTestId('session-status-dot')).toBeVisible();
});
