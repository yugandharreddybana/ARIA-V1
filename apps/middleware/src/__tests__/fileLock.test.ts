import { describe, it, expect } from 'vitest';
import {
  lockAcquireSchema, lockReleaseSchema, lockRefreshSchema,
  hoverSchema, diffDecisionSchema, taskDispatchSchema,
} from '../schemas/lsp.schemas';

describe('LSP schemas (V27.9 §18M)', () => {
  it('lockAcquireSchema clamps ttlSeconds to [5, 600]', () => {
    expect(() => lockAcquireSchema.parse({ path: 'a', agentId: 'a', ttlSeconds: 1 })).toThrow();
    expect(() => lockAcquireSchema.parse({ path: 'a', agentId: 'a', ttlSeconds: 6_000 })).toThrow();
    expect(() => lockAcquireSchema.parse({ path: 'a', agentId: 'a', ttlSeconds: 60 })).not.toThrow();
  });

  it('lockAcquireSchema rejects unknown keys (mass-assignment defence)', () => {
    expect(() => lockAcquireSchema.parse({ path: 'a', agentId: 'a', sneaky: 1 })).toThrow();
  });

  it('lockReleaseSchema requires path + agentId', () => {
    expect(() => lockReleaseSchema.parse({ path: 'a' })).toThrow();
    expect(() => lockReleaseSchema.parse({ path: 'a', agentId: 'a' })).not.toThrow();
  });

  it('lockRefreshSchema rejects ttlSeconds outside [5, 600]', () => {
    expect(() => lockRefreshSchema.parse({ path: 'a', agentId: 'a', ttlSeconds: 4 })).toThrow();
    expect(() => lockRefreshSchema.parse({ path: 'a', agentId: 'a', ttlSeconds: 601 })).toThrow();
  });

  it('hoverSchema requires UUID projectId', () => {
    expect(() => hoverSchema.parse({ projectId: 'not-a-uuid', filePath: 'x', symbol: 's' })).toThrow();
    expect(() => hoverSchema.parse({
      projectId: '11111111-1111-1111-1111-111111111111', filePath: 'x', symbol: 's',
    })).not.toThrow();
  });

  it('diffDecisionSchema enforces 64-char hex diffHash', () => {
    expect(() => diffDecisionSchema.parse({
      agentId: 'a', filePath: 'x',
      diffHash: 'short', decision: 'accepted', decidedBy: 'u',
    })).toThrow();
    expect(() => diffDecisionSchema.parse({
      agentId: 'a', filePath: 'x',
      diffHash: '0'.repeat(64), decision: 'accepted', decidedBy: 'u',
    })).not.toThrow();
  });

  it('taskDispatchSchema rejects unknown commands', () => {
    expect(() => taskDispatchSchema.parse({ command: 'delete-everything', agentId: 'a' })).toThrow();
    expect(() => taskDispatchSchema.parse({ command: 'fix', agentId: 'a' })).not.toThrow();
  });
});
