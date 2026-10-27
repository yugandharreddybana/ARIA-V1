import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetAuthClientForTests,
  abandonSession,
  api,
  ApiError,
  authPathname,
  messageFromApiBody,
} from './api';

function storage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => { map.delete(key); },
    setItem: (key: string, value: string) => { map.set(key, value); },
  };
}

describe('messageFromApiBody', () => {
  it('prefers the first non-empty details message', () => {
    expect(messageFromApiBody({
      error: 'Validation failed',
      message: 'ignored',
      details: [{ message: 'Name must be at least 2 characters' }],
    })).toBe('Name must be at least 2 characters');
  });

  it('skips blank detail messages and falls back to error', () => {
    expect(messageFromApiBody({
      error: 'Validation failed',
      details: [{ message: '  ' }, { message: 12 as unknown as string }],
    })).toBe('Validation failed');
  });

  it('falls back to message, then the default', () => {
    expect(messageFromApiBody({ message: 'legacy' })).toBe('legacy');
    expect(messageFromApiBody({ error: 401 as unknown as string })).toBe('Request failed');
    expect(messageFromApiBody(null)).toBe('Request failed');
    expect(messageFromApiBody(undefined)).toBe('Request failed');
  });
});

describe('authPathname', () => {
  it('strips the query string for SKIP_REFRESH matching', () => {
    expect(authPathname('/auth/refresh?x=1')).toBe('/auth/refresh');
    expect(authPathname('/auth/logout')).toBe('/auth/logout');
  });
});

describe('api refresh-on-401', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    _resetAuthClientForTests();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', { localStorage: storage() });
    vi.stubGlobal('localStorage', window.localStorage);
    localStorage.setItem('aria_token', 'T1');
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    _resetAuthClientForTests();
  });

  it('refreshes once and replays when the access token is rejected', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accessToken: 'T2' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await expect(api<{ ok: boolean }>('/projects')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1][0])).toContain('/api/auth/refresh');
    expect(localStorage.getItem('aria_token')).toBe('T2');
    const replayHeaders = fetchMock.mock.calls[2][1].headers as Record<string, string>;
    expect(replayHeaders.Authorization).toBe('Bearer T2');
  });

  it('does not refresh auth login/signup/refresh/logout even with a query string', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }));
    await expect(api('/auth/refresh?x=1', { method: 'POST' })).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('replays without a second refresh when the token already changed', async () => {
    let calls = 0;
    fetchMock.mockImplementation(async (input: RequestInfo) => {
      calls += 1;
      const url = String(input);
      if (url.includes('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'SHOULD_NOT_REFRESH' }), { status: 200 });
      }
      if (calls === 1) {
        // Another tab/request finished refreshing after this request was sent.
        localStorage.setItem('aria_token', 'T2');
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    await expect(api<{ ok: boolean }>('/projects')).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/auth/refresh'))).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const replayHeaders = fetchMock.mock.calls[1][1].headers as Record<string, string>;
    expect(replayHeaders.Authorization).toBe('Bearer T2');
  });

  it('does not store a refreshed token after abandonSession (logout race)', async () => {
    let finishRefresh: (value: Response) => void = () => undefined;
    const refreshGate = new Promise<Response>((resolve) => { finishRefresh = resolve; });

    fetchMock.mockImplementation(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes('/api/projects')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
      }
      if (url.includes('/api/auth/refresh')) {
        return refreshGate;
      }
      return new Response(JSON.stringify({ error: 'unexpected' }), { status: 500 });
    });

    const pending = api('/projects').catch((err: unknown) => err);
    await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2));
    abandonSession();
    expect(localStorage.getItem('aria_token')).toBeNull();
    finishRefresh(new Response(JSON.stringify({ accessToken: 'T2' }), { status: 200 }));
    const result = await pending;
    expect(result).toBeInstanceOf(ApiError);
    expect(localStorage.getItem('aria_token')).toBeNull();
  });
});
