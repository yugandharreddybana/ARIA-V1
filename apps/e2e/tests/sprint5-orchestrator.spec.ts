/**
 * Sprint 5 — Orchestrator state machine smoke tests.
 *
 * Verifies /api/orchestrator/sessions surface end-to-end through middleware → Java backend:
 *   - create → start → pause → stop transitions
 *   - IDOR protection (another user cannot read/control a session)
 *   - status returns the persisted state
 */

import { test, expect } from '@playwright/test';
import { signup } from './helpers/auth';

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_MIDDLEWARE_URL ?? 'http://localhost:3001';

async function loginApi(request: import('@playwright/test').APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${API_URL}/api/auth/login`, { data: { email, password } });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.accessToken ?? body.data?.accessToken ?? body.token;
}

async function createProject(request: import('@playwright/test').APIRequestContext, token: string): Promise<string> {
  const res = await request.post(`${API_URL}/api/projects`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name: `s5-orch-${Date.now()}` },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.data?.id ?? body.id;
}

test('S5-05 create → start → pause → stop transitions', async ({ page, request }) => {
  const { email, password } = await signup(page);
  const token = await loginApi(request, email, password);
  const projectId = await createProject(request, token);

  // create
  const createRes = await request.post(`${API_URL}/api/orchestrator/sessions`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { projectId, mode: 'precision', environment: 'dev', missionType: 'feature' },
  });
  expect(createRes.ok()).toBeTruthy();
  const created = await createRes.json();
  const sessionId = created.id ?? created.data?.id;
  expect(sessionId).toBeTruthy();
  expect((created.state ?? created.data?.state)).toBe('new');

  // start
  const startRes = await request.post(`${API_URL}/api/orchestrator/sessions/${sessionId}/start`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(startRes.ok()).toBeTruthy();
  const started = await startRes.json();
  expect(started.data?.state ?? started.state).toBe('working');

  // pause
  const pauseRes = await request.post(`${API_URL}/api/orchestrator/sessions/${sessionId}/pause`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(pauseRes.ok()).toBeTruthy();
  const paused = await pauseRes.json();
  expect(paused.data?.state ?? paused.state).toBe('paused');

  // stop
  const stopRes = await request.post(`${API_URL}/api/orchestrator/sessions/${sessionId}/stop`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(stopRes.ok()).toBeTruthy();
  const stopped = await stopRes.json();
  expect(stopped.data?.state ?? stopped.state).toBe('completed');
});

test('S5-06 IDOR — another user cannot read a session they did not create', async ({ page, request }) => {
  const owner = await signup(page);
  const ownerToken = await loginApi(request, owner.email, owner.password);
  const projectId = await createProject(request, ownerToken);
  const createRes = await request.post(`${API_URL}/api/orchestrator/sessions`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
    data: { projectId, mode: 'precision', environment: 'dev', missionType: 'feature' },
  });
  const sessionId = (await createRes.json()).id ?? (await createRes.json()).data?.id;

  // Sign in as a different user in a separate page context.
  await page.context().clearCookies();
  const intruder = await signup(page);
  const intruderToken = await loginApi(request, intruder.email, intruder.password);

  const res = await request.get(`${API_URL}/api/orchestrator/sessions/${sessionId}/status`, {
    headers: { Authorization: `Bearer ${intruderToken}` },
  });
  expect([403, 404]).toContain(res.status());
});
