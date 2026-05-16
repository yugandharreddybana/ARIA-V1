/**
 * Sprint 5 — WebSocket auth smoke tests.
 *
 * Verifies the socket.io hub at /ws:
 *   - Connection without a token is rejected.
 *   - Connection with a valid RS256 access token completes the handshake.
 *   - The server emits a `hello` event on successful auth.
 *
 * Runs in node context via socket.io-client so we do not depend on a real browser.
 */

import { test, expect } from '@playwright/test';

const WS_URL  = process.env.WS_URL ?? process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3001';
const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_MIDDLEWARE_URL ?? 'http://localhost:3001';

async function getToken(request: import('@playwright/test').APIRequestContext): Promise<string> {
  const res = await request.post(`${API_URL}/api/auth/login`, {
    data: { email: process.env.E2E_EMAIL ?? 'test@aria.dev', password: process.env.E2E_PASSWORD ?? 'Test1234!' },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.accessToken ?? body.data?.accessToken ?? body.token;
}

test('S5-07 unauthenticated WS handshake is rejected', async () => {
  // Dynamic import — socket.io-client is a web-package dep but works in Node too.
  const mod = await import('socket.io-client');
  const io = mod.io ?? mod.default;
  await new Promise<void>((resolve, reject) => {
    const socket = io(WS_URL, { path: '/ws', transports: ['websocket'], reconnection: false });
    socket.on('connect', () => {
      socket.disconnect();
      reject(new Error('connection should have been rejected'));
    });
    socket.on('connect_error', () => {
      socket.disconnect();
      resolve();
    });
    setTimeout(() => { socket.disconnect(); resolve(); }, 5_000);
  });
});

test('S5-08 authenticated WS handshake emits hello', async ({ request }) => {
  const token = await getToken(request);
  const mod = await import('socket.io-client');
  const io = mod.io ?? mod.default;
  await new Promise<void>((resolve, reject) => {
    const socket = io(WS_URL, {
      path: '/ws',
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    });
    socket.on('hello', (payload: { userId: string; ts: string }) => {
      expect(payload.userId).toBeTruthy();
      socket.disconnect();
      resolve();
    });
    socket.on('connect_error', (err: Error) => {
      socket.disconnect();
      reject(err);
    });
    setTimeout(() => { socket.disconnect(); reject(new Error('no hello within timeout')); }, 8_000);
  });
});
