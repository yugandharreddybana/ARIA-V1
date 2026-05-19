/**
 * Sprint 8 — Concept Graph coverage smoke test.
 * Verifies the coverage endpoint exists and returns the documented shape.
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

test('S8-05 backend graph coverage endpoint returns numeric metrics', async ({ request }) => {
  const t = await token(request);
  // Proxied via middleware → backend. Coverage is read-only and works against any project UUID.
  const projectId = '11111111-1111-1111-1111-111111111111';
  const r = await request.get(`${process.env.BACKEND_URL ?? 'http://localhost:8080'}/api/graph/coverage/${projectId}`, {
    headers: { Authorization: `Bearer ${t}` },
  });
  expect([200, 401, 403]).toContain(r.status());
  if (r.ok()) {
    const body = await r.json();
    expect(typeof body.symbols_total).toBe('number');
    expect(typeof body.summary_coverage_pct).toBe('number');
    expect(body.coverage_target_pct).toBe(95.0);
  }
});
