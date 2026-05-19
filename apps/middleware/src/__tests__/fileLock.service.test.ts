import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StubPgPool, StubRedis } from '../services/fileLock.service.test-stubs';

const stubRedis = new StubRedis();
const stubPool  = new StubPgPool();

// Replace ioredis + the db pool BEFORE importing the service under test.
vi.mock('ioredis', () => ({ default: class { constructor() { return stubRedis as unknown as object; } } }));
vi.mock('../services/db.client', () => ({ getPgPool: () => stubPool }));

import { acquire, release, refresh, inspect } from '../services/fileLock.service';

describe('fileLock.service', () => {
  beforeEach(() => {
    stubRedis.store.clear();
    stubPool.queries.length = 0;
  });

  it('acquire returns the lock owner and mirrors to Postgres', async () => {
    const lock = await acquire('apps/web/src/foo.tsx', 'agent-a', { ttlSeconds: 30, reason: 'edit' });
    expect(lock).not.toBeNull();
    expect(lock!.agentId).toBe('agent-a');
    expect(lock!.ttlSeconds).toBe(30);
    // Mirror upsert fired
    expect(stubPool.queries.find(q => q.sql.includes('INSERT INTO file_locks'))).toBeTruthy();
  });

  it('acquire rejects a second holder while the first is alive', async () => {
    await acquire('a.ts', 'agent-a', { ttlSeconds: 60 });
    const second = await acquire('a.ts', 'agent-b', { ttlSeconds: 60 });
    expect(second).toBeNull();
  });

  it('clamps ttlSeconds outside [5, 600] to the bounds before persisting', async () => {
    const tiny = await acquire('b.ts', 'agent-a', { ttlSeconds: 1 });
    expect(tiny!.ttlSeconds).toBe(5);
    await release('b.ts', 'agent-a');
    const huge = await acquire('b.ts', 'agent-a', { ttlSeconds: 9_999 });
    expect(huge!.ttlSeconds).toBe(600);
  });

  it('release fails for non-holder', async () => {
    await acquire('c.ts', 'agent-a', { ttlSeconds: 60 });
    expect(await release('c.ts', 'agent-b')).toBe(false);
    expect(await release('c.ts', 'agent-a')).toBe(true);
  });

  it('refresh fails for non-holder and succeeds for holder', async () => {
    await acquire('d.ts', 'agent-a', { ttlSeconds: 60 });
    expect(await refresh('d.ts', 'agent-b', 120)).toBeNull();
    const r = await refresh('d.ts', 'agent-a', 120);
    expect(r).not.toBeNull();
    expect(r!.ttlSeconds).toBeLessThanOrEqual(120);
  });

  it('inspect returns null on a missing path', async () => {
    expect(await inspect('never.ts')).toBeNull();
  });
});
