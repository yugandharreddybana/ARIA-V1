const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await res.json();

    if (!res.ok) {
      throw new ApiError(data.error || 'Request failed', res.status, data.code, data.details);
    }

    return data;
  }

  async get<T>(path: string, token?: string): Promise<T> {
    return this.request<T>(path, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  }

  async post<T>(path: string, body: unknown, token?: string): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: Array<{ field: string; message: string }>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const apiClient = new ApiClient(API_URL);
