/**
 * Sprint 6 — Turn-1 Discovery Form smoke tests.
 * Validates Zod-strict rejection of unknown keys and that authenticated POSTs
 * persist (or report 401 if not authenticated).
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

test('S6-12 unauthenticated POST /api/ui-discovery is 401', async ({ request }) => {
  const res = await request.post(`${API_URL}/api/ui-discovery`, { data: {} });
  expect([401, 403]).toContain(res.status());
});

test('S6-13 .strict() rejects unknown keys', async ({ request }) => {
  const t = await token(request);
  const res = await request.post(`${API_URL}/api/ui-discovery`, {
    headers: { Authorization: `Bearer ${t}` },
    data: {
      ticketId: 'T-1',
      audience: 'devs',
      surface: 'web',
      tone: 'concise',
      sneaky_field: 'should_not_be_accepted',
    },
  });
  expect([400, 422]).toContain(res.status());
});

test('S6-14 authenticated upsert + get round-trip', async ({ request }) => {
  const t = await token(request);
  const ticketId = `T-S6-${Date.now()}`;
  const post = await request.post(`${API_URL}/api/ui-discovery`, {
    headers: { Authorization: `Bearer ${t}` },
    data: {
      ticketId, audience: 'devs', surface: 'web', tone: 'concise',
      brandContext: 'ARIA-V1', constraints: ['a11y AA'], successMetrics: ['time-to-fix'],
    },
  });
  expect(post.ok()).toBeTruthy();
  const get = await request.get(`${API_URL}/api/ui-discovery/${ticketId}`, {
    headers: { Authorization: `Bearer ${t}` },
  });
  expect(get.ok()).toBeTruthy();
  const body = await get.json();
  expect(body.data.audience).toBe('devs');
  expect(body.data.constraints).toContain('a11y AA');
});
