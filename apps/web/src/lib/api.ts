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
    const body = await res.json().catch(() => ({ message: 'Request failed' }));
    throw new ApiError(body.message ?? 'Request failed', res.status, body.details ?? []);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}
