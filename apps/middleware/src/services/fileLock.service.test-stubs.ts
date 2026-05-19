/**
 * Stub Redis client + pg pool used by `fileLock.service.test.ts`. Kept in a separate file so
 * the production `fileLock.service.ts` doesn't carry test-only branches.
 *
 * Replace the real singletons by re-exporting from this module via vi.mock() in the test.
 */

type Value = { v: string; expires: number };

export class StubRedis {
  store = new Map<string, Value>();
  now = () => Date.now();

  async connect(): Promise<void> {}
  async quit(): Promise<void> {}
  async get(key: string): Promise<string | null> {
    const hit = this.store.get(key);
    if (!hit) return null;
    if (hit.expires > 0 && hit.expires < this.now()) { this.store.delete(key); return null; }
    return hit.v;
  }
  // ioredis 5 SET signature: set(key, value, 'EX', seconds, 'NX')
  async set(key: string, value: string, _flagEx?: string, ttl?: number, mode?: string): Promise<'OK' | null> {
    if (mode === 'NX' && (await this.get(key)) !== null) return null;
    this.store.set(key, { v: value, expires: ttl ? this.now() + ttl * 1_000 : 0 });
    return 'OK';
  }
  async del(key: string): Promise<number> { return this.store.delete(key) ? 1 : 0; }
  async ttl(key: string): Promise<number> {
    const hit = this.store.get(key);
    if (!hit) return -2;
    if (!hit.expires) return -1;
    return Math.max(0, Math.ceil((hit.expires - this.now()) / 1_000));
  }
  async expire(key: string, seconds: number): Promise<number> {
    const hit = this.store.get(key);
    if (!hit) return 0;
    hit.expires = this.now() + seconds * 1_000;
    return 1;
  }
}

export class StubPgPool {
  queries: Array<{ sql: string; params: unknown[] }> = [];
  async query(sql: string, params: unknown[] = []): Promise<{ rows: unknown[] }> {
    this.queries.push({ sql, params });
    return { rows: [] };
  }
  async end(): Promise<void> {}
}
