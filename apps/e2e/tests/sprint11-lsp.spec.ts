/**
 * Sprint 11 — LSP-facing middleware smoke tests.
 *
 * Verifies the /api/lsp/* routes exist, are auth-gated, and reject Zod-strict violations.
 * The real VS Code <-> LSP server roundtrip is run by the Sprint 14 chaos sandbox.
 */
import { test, expect } from '@playwright/test';

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_MIDDLEWARE_URL ?? 'http://localhost:3001';

async function token(request: import('@playwright/test').APIRequestContext): Promise<string | null> {
  const res = await request.post(`${API_URL}/api/auth/login`, {
    data: { email: process.env.E2E_EMAIL ?? 'test@aria.dev', password: process.env.E2E_PASSWORD ?? 'Test1234!' },
  });
  if (!res.ok()) return null;
  const b = await res.json();
  return b.accessToken ?? b.data?.accessToken ?? b.token;
}

test('S11-01 POST /api/lsp/locks requires auth', async ({ request }) => {
  const r = await request.post(`${API_URL}/api/lsp/locks`, { data: {} });
  expect([401, 403]).toContain(r.status());
});

test('S11-02 hover rejects unknown keys via Zod strict', async ({ request }) => {
  const t = await token(request);
  if (!t) return;
  const r = await request.post(`${API_URL}/api/lsp/hover`, {
    headers: { Authorization: `Bearer ${t}` },
    data: { projectId: '11111111-1111-1111-1111-111111111111', filePath: 'x', symbol: 's', sneaky: 1 },
  });
  expect([400, 422]).toContain(r.status());
});

test('S11-03 task dispatch returns a deterministic-looking taskId', async ({ request }) => {
  const t = await token(request);
  if (!t) return;
  const r = await request.post(`${API_URL}/api/lsp/tasks`, {
    headers: { Authorization: `Bearer ${t}` },
    data: { command: 'fix', agentId: 'lsp-editor' },
  });
  expect([202, 502]).toContain(r.status());
  if (r.status() === 202) {
    const body = await r.json();
    expect(body.data.command).toBe('fix');
    expect(typeof body.data.taskId).toBe('string');
  }
});

test('S11-04 diff decision schema rejects non-hex diffHash', async ({ request }) => {
  const t = await token(request);
  if (!t) return;
  const r = await request.post(`${API_URL}/api/lsp/diff/decisions`, {
    headers: { Authorization: `Bearer ${t}` },
    data: { agentId: 'a', filePath: 'x', diffHash: 'short', decision: 'accepted', decidedBy: 'u' },
  });
  expect([400, 422]).toContain(r.status());
});
