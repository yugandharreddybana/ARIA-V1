const BASE_URL = process.env.NEXT_PUBLIC_MIDDLEWARE_URL ?? 'http://localhost:3001';

export function messageFromApiBody(body: {
  error?: unknown;
  message?: unknown;
  details?: Array<{ message?: unknown }>;
} | null | undefined): string {
  const detail = body?.details?.find((row) => typeof row?.message === 'string' && row.message.trim());
  if (detail && typeof detail.message === 'string') return detail.message;
  if (typeof body?.error === 'string' && body.error.trim()) return body.error;
  if (typeof body?.message === 'string' && body.message.trim()) return body.message;
  return 'Request failed';
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details: { field: string; message: string }[] = []
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const SKIP_REFRESH = new Set(['/auth/login', '/auth/signup', '/auth/refresh', '/auth/logout']);

/** Bumped by abandonSession so an in-flight refresh cannot rewrite a token after logout. */
let authEpoch = 0;
let refreshInFlight: Promise<string | null> | null = null;

export function authPathname(path: string): string {
  const cut = path.indexOf('?');
  return cut === -1 ? path : path.slice(0, cut);
}

function shouldSkipRefresh(path: string): boolean {
  return SKIP_REFRESH.has(authPathname(path));
}

/** Clear the access token and invalidate any in-flight refresh write. */
export function abandonSession(): void {
  authEpoch += 1;
  refreshInFlight = null;
  if (typeof window !== 'undefined') localStorage.removeItem('aria_token');
}

/** Test-only: reset single-flight and epoch state between cases. */
export function _resetAuthClientForTests(): void {
  authEpoch = 0;
  refreshInFlight = null;
}

async function refreshAccessToken(expectedToken: string, epoch: number): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const res = await fetch(`${BASE_URL}/api/auth/refresh`, { method: 'POST', credentials: 'include' });
  if (epoch !== authEpoch) return null;
  if (!res.ok) return null;
  const body = await res.json().catch(() => null) as { accessToken?: unknown } | null;
  if (!body || typeof body.accessToken !== 'string' || !body.accessToken) return null;
  if (epoch !== authEpoch) return null;
  const current = localStorage.getItem('aria_token');
  if (current !== expectedToken) {
    // Logged out (null) or another refresh already stored a newer token.
    return current;
  }
  localStorage.setItem('aria_token', body.accessToken);
  return body.accessToken;
}

async function authorizedFetch(path: string, options: RequestInit | undefined, retry: boolean): Promise<Response> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('aria_token') : null;
  const res = await fetch(`${BASE_URL}/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
    credentials: 'include',
  });
  if (
    res.status === 401 &&
    retry &&
    !shouldSkipRefresh(path) &&
    typeof window !== 'undefined' &&
    token
  ) {
    const current = localStorage.getItem('aria_token');
    if (current && current !== token) {
      // A refresh finished after this request was sent — replay with the new token.
      return authorizedFetch(path, options, false);
    }
    if (current) {
      const epoch = authEpoch;
      refreshInFlight ??= refreshAccessToken(token, epoch).finally(() => { refreshInFlight = null; });
      if (await refreshInFlight) return authorizedFetch(path, options, false);
    }
  }
  return res;
}

async function errorFrom(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => ({ error: 'Request failed' }));
  return new ApiError(messageFromApiBody(body), res.status, body.details ?? []);
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await authorizedFetch(path, options, true);
  if (!res.ok) throw await errorFrom(res);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export async function downloadApi(path: string, filename: string): Promise<void> {
  const res = await authorizedFetch(path, undefined, true);
  if (!res.ok) throw await errorFrom(res);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
