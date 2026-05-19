/**
 * Sprint 8 — Distillation + Pre-Flight Estimator smoke tests.
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

test('S8-01 /api/distill rejects unauthenticated requests', async ({ request }) => {
  const r = await request.post(`${API_URL}/api/distill`, { data: {} });
  expect([401, 403]).toContain(r.status());
});

test('S8-02 /api/distill rejects empty body via Zod strict', async ({ request }) => {
  const t = await token(request);
  const r = await request.post(`${API_URL}/api/distill`, {
    headers: { Authorization: `Bearer ${t}` }, data: {},
  });
  expect([400, 422]).toContain(r.status());
});

test('S8-03 /api/distill rejects unknown keys', async ({ request }) => {
  const t = await token(request);
  const r = await request.post(`${API_URL}/api/distill`, {
    headers: { Authorization: `Bearer ${t}` },
    data: {
      projectId: '11111111-1111-1111-1111-111111111111',
      agentId: 'qa',
      taskDescription: 'test',
      sneaky_field: 'no thanks',
    },
  });
  expect([400, 422]).toContain(r.status());
});

test('S8-04 /api/distill/preflight returns a typed payload', async ({ request }) => {
  const t = await token(request);
  const r = await request.post(`${API_URL}/api/distill/preflight`, {
    headers: { Authorization: `Bearer ${t}` },
    data: {
      projectId: '11111111-1111-1111-1111-111111111111',
      agentId: 'qa',
      rawPromptTokens: 1000,
    },
  });
  expect(r.ok()).toBeTruthy();
  const body = await r.json();
  expect(body.data).toMatchObject({
    compressionRatio: expect.any(Number),
    projectedTokens:  expect.any(Number),
    sampleCount:      expect.any(Number),
  });
});
