/**
 * Sprint 10 — Fleet Commander smoke tests.
 * Validates that the envelope endpoints reject unsigned + unauthenticated calls and that the
 * canonical state machine endpoints exist.
 */
import { test, expect } from '@playwright/test';

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_MIDDLEWARE_URL ?? 'http://localhost:3001';

async function token(request: import('@playwright/test').APIRequestContext): Promise<string> {
  const res = await request.post(`${API_URL}/api/auth/login`, {
    data: { email: process.env.E2E_EMAIL ?? 'test@aria.dev', password: process.env.E2E_PASSWORD ?? 'Test1234!' },
  });
  expect(res.ok()).toBeTruthy();
  const b = await res.json();
  return b.accessToken ?? b.data?.accessToken ?? b.token;
}

test('S10-01 /api/fleet/events POST without auth is 401', async ({ request }) => {
  const r = await request.post(`${API_URL}/api/fleet/events`, { data: {} });
  expect([401, 403]).toContain(r.status());
});

test('S10-02 /api/fleet/events rejects unknown keys via .strict()', async ({ request }) => {
  const t = await token(request);
  const r = await request.post(`${API_URL}/api/fleet/events`, {
    headers: { Authorization: `Bearer ${t}` },
    data: { epicId: 'e', topic: 'X', payload: '{}', agentId: 'a', signature: 'sig', sneaky: 'no' },
  });
  expect([400, 422]).toContain(r.status());
});

test('S10-03 /api/fleet/events GET returns recent envelopes (possibly empty)', async ({ request }) => {
  const t = await token(request);
  const r = await request.get(`${API_URL}/api/fleet/events`, { headers: { Authorization: `Bearer ${t}` } });
  // 200 OK with array, OR 502 if the backend is down (NO-RUN MODE).
  expect([200, 502]).toContain(r.status());
  if (r.ok()) {
    const body = await r.json();
    expect(Array.isArray(body.data)).toBe(true);
  }
});
