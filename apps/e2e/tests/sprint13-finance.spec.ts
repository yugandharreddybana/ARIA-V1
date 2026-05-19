/**
 * Sprint 13 — Finance & Procurement smoke tests.
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

test('S13-01 finops/estimate requires auth', async ({ request }) => {
  const r = await request.post(`${API}/api/finance/finops/estimate`, { data: {} });
  expect([401, 403]).toContain(r.status());
});

test('S13-02 finops/estimate rejects bogus sessionId', async ({ request }) => {
  const t = await token(request); if (!t) return;
  const r = await request.post(`${API}/api/finance/finops/estimate`, {
    headers: { Authorization: `Bearer ${t}` },
    data: { sessionId: 'not-a-uuid', tokens: 0, computeMinutes: 0, storageGbDays: 0, remoteBackend: true },
  });
  expect([400, 422]).toContain(r.status());
});

test('S13-03 procurement proposals reject overflow candidate lists', async ({ request }) => {
  const t = await token(request); if (!t) return;
  const candidates = Array.from({ length: 51 }, (_, i) => ({
    vendorId: '11111111-1111-1111-1111-111111111111',
    name: `v${i}`, monthlyCostUsd: 1, featureCoverage: 0.5, slaUptime: 0.99, trustScore: 0.5,
  }));
  const r = await request.post(`${API}/api/finance/procurement/proposals`, {
    headers: { Authorization: `Bearer ${t}` },
    data: { proposedBy: 'u', problem: 'p', category: 'c', candidates },
  });
  expect([400, 422]).toContain(r.status());
});

test('S13-04 arbitrage enforces non-negative savings', async ({ request }) => {
  const t = await token(request); if (!t) return;
  const r = await request.post(`${API}/api/finance/arbitrage/proposals`, {
    headers: { Authorization: `Bearer ${t}` },
    data: {
      service: 'postgres', currentProvider: 'aws-rds', candidateProvider: 'gcp-cloudsql',
      monthlySavingsUsd: -10, rationaleMd: 'noop',
    },
  });
  expect([400, 422]).toContain(r.status());
});

test('S13-05 diplomat playbook caps competitors at 10', async ({ request }) => {
  const t = await token(request); if (!t) return;
  const r = await request.post(`${API}/api/finance/diplomat/playbook`, {
    headers: { Authorization: `Bearer ${t}` },
    data: { vendor: 'v', targetUsd: 100, competitors: Array.from({ length: 11 }, () => 'x') },
  });
  expect([400, 422]).toContain(r.status());
});
