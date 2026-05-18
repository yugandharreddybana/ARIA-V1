/**
 * Sprint 9 — Telemetry & Incidents smoke tests.
 */
import { test, expect } from '@playwright/test';

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_MIDDLEWARE_URL ?? 'http://localhost:3001';

test('S9-01 /metrics returns Prometheus text exposition format', async ({ request }) => {
  const r = await request.get(`${API_URL}/metrics`);
  expect(r.ok()).toBeTruthy();
  const body = await r.text();
  expect(body).toContain('aria_middleware_info');
  expect(body).toContain('# TYPE');
});

test('S9-02 unauthenticated POST /api/incidents is 401', async ({ request }) => {
  const r = await request.post(`${API_URL}/api/incidents`, { data: {} });
  expect([401, 403]).toContain(r.status());
});

test('S9-03 .strict() rejects unknown keys', async ({ request }) => {
  const login = await request.post(`${API_URL}/api/auth/login`, {
    data: { email: process.env.E2E_EMAIL ?? 'test@aria.dev', password: process.env.E2E_PASSWORD ?? 'Test1234!' },
  });
  if (!login.ok()) return;
  const t = (await login.json()).accessToken;
  const r = await request.post(`${API_URL}/api/incidents`, {
    headers: { Authorization: `Bearer ${t}` },
    data: { source: 'op', severity: 'P3', title: 't', description: 'd', sneaky: 'no' },
  });
  expect([400, 422]).toContain(r.status());
});
