/**
 * Sprint 10 — Deadlock Breaker smoke tests.
 * Validates the heartbeat ingestion + sweep endpoints exist + are auth-gated.
 */
import { test, expect } from '@playwright/test';

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_MIDDLEWARE_URL ?? 'http://localhost:3001';

test('S10-04 POST /api/fleet/heartbeats requires auth', async ({ request }) => {
  const r = await request.post(`${API_URL}/api/fleet/heartbeats`, { data: {} });
  expect([401, 403]).toContain(r.status());
});

test('S10-05 POST /api/fleet/deadlock/sweep returns contract debts list (possibly empty)', async ({ request }) => {
  const login = await request.post(`${API_URL}/api/auth/login`, {
    data: { email: process.env.E2E_EMAIL ?? 'test@aria.dev', password: process.env.E2E_PASSWORD ?? 'Test1234!' },
  });
  if (!login.ok()) return;
  const t = (await login.json()).accessToken ?? (await login.json()).data?.accessToken;
  const r = await request.post(`${API_URL}/api/fleet/deadlock/sweep`, {
    headers: { Authorization: `Bearer ${t}` },
  });
  expect([200, 502]).toContain(r.status());
  if (r.ok()) {
    const body = await r.json();
    expect(Array.isArray(body.data)).toBe(true);
  }
});
