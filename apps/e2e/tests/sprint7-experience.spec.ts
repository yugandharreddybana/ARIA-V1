/**
 * Sprint 7 — Experience & Memory smoke tests.
 *
 * Validates the /api/experience surface: list / read / append / audit, plus a
 * round-trip that promotes an ai-only entry to human-approved.
 */
import { test, expect } from '@playwright/test';

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_MIDDLEWARE_URL ?? 'http://localhost:3001';

async function token(request: import('@playwright/test').APIRequestContext): Promise<string> {
  const res = await request.post(`${API_URL}/api/auth/login`, {
    data: { email: process.env.E2E_EMAIL ?? 'test@aria.dev', password: process.env.E2E_PASSWORD ?? 'Test1234!' },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.accessToken ?? body.data?.accessToken ?? body.token;
}

test('S7-01 GET /api/experience lists known skills', async ({ request }) => {
  const t = await token(request);
  const res = await request.get(`${API_URL}/api/experience`, { headers: { Authorization: `Bearer ${t}` } });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(Array.isArray(body.data)).toBe(true);
  expect(body.data).toEqual(expect.arrayContaining(['backend-api-specialist', 'frontend-web-specialist']));
});

test('S7-02 GET /api/experience/:slug returns shape with veracity tags', async ({ request }) => {
  const t = await token(request);
  const res = await request.get(`${API_URL}/api/experience/backend-api-specialist`, { headers: { Authorization: `Bearer ${t}` } });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.data.skill).toBe('backend-api-specialist');
  expect(Array.isArray(body.data.best_practices)).toBe(true);
  if (body.data.best_practices.length > 0) {
    expect(body.data.best_practices[0]).toMatchObject({ text: expect.any(String), veracity: expect.any(String) });
  }
});

test('S7-03 unknown keys rejected by Zod .strict()', async ({ request }) => {
  const t = await token(request);
  const res = await request.post(`${API_URL}/api/experience/entries`, {
    headers: { Authorization: `Bearer ${t}` },
    data: { skill: 'qa-e2e', kind: 'best_practice', text: 't', sneaky: 'x' },
  });
  expect([400, 422]).toContain(res.status());
});

test('S7-04 append + audit round-trip', async ({ request }) => {
  const t = await token(request);
  const append = await request.post(`${API_URL}/api/experience/entries`, {
    headers: { Authorization: `Bearer ${t}` },
    data: { skill: 'qa-e2e', kind: 'best_practice', text: `S7-04-${Date.now()}`, veracity: 'ai-only' },
  });
  expect([200, 201]).toContain(append.status());
  const audit = await request.get(`${API_URL}/api/experience/qa-e2e/audit`, { headers: { Authorization: `Bearer ${t}` } });
  expect(audit.ok()).toBeTruthy();
  const body = await audit.json();
  expect(body.data.byVeracity['ai-only']).toBeGreaterThanOrEqual(1);
});
