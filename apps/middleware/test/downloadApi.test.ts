import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, downloadApi, messageFromApiBody } from '../../web/src/lib/api';

const store = new Map<string, string>();

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    blob: async () => new Blob([typeof body === 'string' ? body : JSON.stringify(body)]),
  } as Response;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  store.clear();
});

function installBrowser() {
  const clicked: string[] = [];
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  });
  vi.stubGlobal('document', {
    createElement: () => ({
      href: '',
      download: '',
      click: () => { clicked.push('click'); },
      remove: () => undefined,
    }),
    body: { appendChild: () => undefined },
  });
  vi.stubGlobal('URL', {
    createObjectURL: () => 'blob:report',
    revokeObjectURL: () => undefined,
  });
  vi.useFakeTimers({ toFake: ['setTimeout'] });
  return clicked;
}

describe('downloadApi refresh', () => {
  it('prefers a validation detail over a generic error', () => {
    expect(messageFromApiBody({ error: 'Validation failed', details: [{ message: 'Name is required' }] })).toBe('Name is required');
  });

  it('refreshes a 401 and retries the report download with the new token', async () => {
    store.set('aria_token', 'expired');
    const clicked = installBrowser();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/api/auth/refresh')) return jsonResponse(200, { accessToken: 'fresh' });
      const auth = new Headers(init?.headers).get('authorization');
      if (auth === 'Bearer expired') return jsonResponse(401, { error: 'Access token expired' });
      return jsonResponse(200, 'pdf-bytes');
    });
    vi.stubGlobal('fetch', fetchMock);
    await downloadApi('/tickets/11111111-1111-4111-8111-111111111111/reports/dev.pdf', 'dev-report.pdf');
    await vi.runAllTimersAsync();
    expect(store.get('aria_token')).toBe('fresh');
    expect(clicked).toEqual(['click']);
    const reportCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('/reports/dev.pdf') && new Headers(call[1]?.headers).get('authorization') === 'Bearer fresh');
    expect(reportCall).toBeTruthy();
  });

  it('surfaces the server message when refresh fails', async () => {
    store.set('aria_token', 'expired');
    installBrowser();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).endsWith('/api/auth/refresh')) return jsonResponse(401, { error: 'Invalid or expired refresh token' });
      return jsonResponse(401, { error: 'Access token expired', message: 'ignored' });
    }));
    await expect(api('/projects')).rejects.toMatchObject({ name: 'ApiError', status: 401, message: 'Access token expired' } satisfies Partial<ApiError>);
  });
});
