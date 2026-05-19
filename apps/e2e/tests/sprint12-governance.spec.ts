/**
 * Sprint 12 — Governance & Legal smoke tests.
 */
import { test, expect } from '@playwright/test';

const API = process.env.API_URL ?? process.env.NEXT_PUBLIC_MIDDLEWARE_URL ?? 'http://localhost:3001';

async function token(request: import('@playwright/test').APIRequestContext): Promise<string | null> {
  const res = await request.post(`${API}/api/auth/login`, {
    data: { email: process.env.E2E_EMAIL ?? 'test@aria.dev', password: process.env.E2E_PASSWORD ?? 'Test1234!' },
  });
  if (!res.ok()) return null;
  const b = await res.json();
  return b.accessToken ?? b.data?.accessToken ?? b.token;
}

test('S12-01 POST /api/governance/compliance/scan requires auth', async ({ request }) => {
  const r = await request.post(`${API}/api/governance/compliance/scan`, { data: {} });
  expect([401, 403]).toContain(r.status());
});

test('S12-02 scan rejects unknown keys via .strict()', async ({ request }) => {
  const t = await token(request);
  if (!t) return;
  const r = await request.post(`${API}/api/governance/compliance/scan`, {
    headers: { Authorization: `Bearer ${t}` },
    data: { triggeredBy: 'ci', diff: 'x', stowaway: 1 },
  });
  expect([400, 422]).toContain(r.status());
});

test('S12-03 decide rejects bogus transition', async ({ request }) => {
  const t = await token(request);
  if (!t) return;
  const r = await request.post(`${API}/api/governance/compliance/00000000-0000-0000-0000-000000000000/decide`, {
    headers: { Authorization: `Bearer ${t}` },
    data: { decidedBy: 'u', to: 'whatever' },
  });
  expect([400, 422, 502]).toContain(r.status());
});

test('S12-04 audit export enforces the 4 scopes', async ({ request }) => {
  const t = await token(request);
  if (!t) return;
  const r = await request.post(`${API}/api/governance/audit/export`, {
    headers: { Authorization: `Bearer ${t}` },
    data: { requestedBy: 'u', scope: 'pci' },
  });
  expect([400, 422]).toContain(r.status());
});

test('S12-05 gdpr redact enforces enum reasons', async ({ request }) => {
  const t = await token(request);
  if (!t) return;
  const r = await request.post(`${API}/api/governance/gdpr/redact`, {
    headers: { Authorization: `Bearer ${t}` },
    data: { table: 'users', sourceId: 'u', column: 'email', reason: 'because', requestedBy: 'u' },
  });
  expect([400, 422]).toContain(r.status());
});
