const BASE_URL = process.env.NEXT_PUBLIC_MIDDLEWARE_URL ?? 'http://localhost:3001';

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

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
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
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    // Middleware sends { success, error, code } — prefer `error`, fall back to
    // `message` for any legacy or third-party responses that still use that field.
    throw new ApiError(
      body.error ?? body.message ?? 'Request failed',
      res.status,
      body.details ?? [],
    );
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export async function downloadApi(path: string, filename: string): Promise<void> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('aria_token') : null;
  const res = await fetch(`${BASE_URL}/api${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new ApiError(body.error ?? body.message ?? 'Request failed', res.status, body.details ?? []);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // ponytail: revoke after the browser has started the download. Immediate revoke drops the file.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
