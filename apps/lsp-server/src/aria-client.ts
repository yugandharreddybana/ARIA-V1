/**
 * Thin HTTP client for the ARIA middleware. Centralised here so the LSP server's hover /
 * diagnostics / lock / task-dispatch handlers all share auth + base-URL handling.
 *
 * The LSP server runs in the user's editor process, so it reads the access token from the
 * `ARIA_ACCESS_TOKEN` env var (the VS Code extension keeps the token in OS keychain and
 * sets the env on launch).
 */

type FetchInit = RequestInit & { headers?: Record<string, string> };

export class AriaClient {
  constructor(
    private readonly baseUrl: string,
    private readonly tokenProvider: () => string | undefined,
  ) {}

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    const t = this.tokenProvider();
    if (t) headers.authorization = `Bearer ${t}`;
    const init: FetchInit = { method, headers, body: body ? JSON.stringify(body) : undefined };
    const res = await fetch(`${this.baseUrl}${path}`, init);
    if (!res.ok) {
      const text = await res.text().catch(() => 'unknown error');
      throw new Error(`ARIA ${method} ${path} → ${res.status}: ${text}`);
    }
    return (await res.json()) as T;
  }

  // ── locks ──
  acquireLock(args: { path: string; agentId: string; ttlSeconds?: number; sessionId?: string; reason?: string }) {
    return this.call<{ success: boolean; data: unknown }>('POST', '/api/lsp/locks', args);
  }
  releaseLock(args: { path: string; agentId: string }) {
    return this.call<{ success: boolean; data: { released: boolean } }>('POST', '/api/lsp/locks/release', args);
  }
  inspectLock(path: string) {
    return this.call<{ success: boolean; data: unknown }>('GET', `/api/lsp/locks/inspect?path=${encodeURIComponent(path)}`);
  }

  // ── hover / dispatch / diff decisions ──
  hover(args: { projectId: string; filePath: string; symbol: string; cursorLine?: number }) {
    return this.call<{ success: boolean; data: HoverPayload }>('POST', '/api/lsp/hover', args);
  }
  dispatchTask(args: { command: string; agentId: string; projectId?: string; filePath?: string; selection?: string; cursorLine?: number }) {
    return this.call<{ success: boolean; data: { taskId: string; command: string; status: string } }>('POST', '/api/lsp/tasks', args);
  }
  diffDecision(args: { agentId: string; sessionId?: string; filePath: string; diffHash: string; decision: 'accepted'|'rejected'|'expired'; decidedBy: string; diffExcerpt?: string }) {
    return this.call<{ success: boolean }>('POST', '/api/lsp/diff/decisions', args);
  }
}

export interface HoverPayload {
  symbol: string;
  filePath: string;
  summary: string | null;
  module:  string | null;
  domain:  string | null;
  decisions: Array<{ adrId: string; title: string; summary: string }>;
  latencyMs: number;
}
