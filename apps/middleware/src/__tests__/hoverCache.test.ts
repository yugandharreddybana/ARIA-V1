import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'node:http';
import { hover, _resetHoverCacheForTests } from '../controllers/lsp.controller';

// Stub the distill service so we can count round-trips.
let distillCalls = 0;
vi.mock('../services/distill.service', () => ({
  distill: vi.fn(async () => {
    distillCalls++;
    return {
      taskId: 't', agentId: 'lsp-hover', distillationTimestamp: new Date().toISOString(),
      totalTokensEstimated: 10, rawTokensWouldHaveBeen: 100, compressionRatio: 10,
      affectedSymbols: [{ symbol: 's', summary: 'sum', filePath: 'f', lineStart: 1, lineEnd: 2 }],
      moduleContext:   [{ module: 'm', summary: 'msum' }],
      domainConcepts:  [{ concept: 'd', summary: 'dsum' }],
      governingDecisions: [],
      experienceNotes: [], antiPatterns: [],
      durationMs: 12,
    };
  }),
}));

type ResShape = { status: number; body: Record<string, unknown> };
function fakeRes(): { res: express.Response; out: ResShape } {
  const out: ResShape = { status: 200, body: {} };
  const res = {
    status(code: number) { out.status = code; return this; },
    json(b: Record<string, unknown>) { out.body = b; return this; },
  } as unknown as express.Response;
  return { res, out };
}

describe('LSP hover LRU cache (ADR-0016 perf budget)', () => {
  beforeEach(() => {
    _resetHoverCacheForTests();
    distillCalls = 0;
  });

  it('first request misses, second request hits the cache', async () => {
    const req = {
      headers: { authorization: 'Bearer t' },
      body: { projectId: '11111111-1111-1111-1111-111111111111', filePath: 'a.ts', symbol: 'foo' },
    } as unknown as express.Request;
    const { res: r1, out: o1 } = fakeRes();
    await hover(req as never, r1, () => {});
    expect(distillCalls).toBe(1);
    expect((o1.body as { cached?: boolean }).cached).toBe(false);

    const { res: r2, out: o2 } = fakeRes();
    await hover(req as never, r2, () => {});
    expect(distillCalls).toBe(1); // still 1 — cache hit
    expect((o2.body as { cached?: boolean }).cached).toBe(true);
  });

  it('different (projectId, filePath, symbol) triggers a fresh distill call', async () => {
    const baseReq = (sym: string) => ({
      headers: { authorization: 'Bearer t' },
      body: { projectId: '11111111-1111-1111-1111-111111111111', filePath: 'a.ts', symbol: sym },
    } as unknown as express.Request);
    const { res: ra } = fakeRes();
    const { res: rb } = fakeRes();
    await hover(baseReq('one') as never, ra, () => {});
    await hover(baseReq('two') as never, rb, () => {});
    expect(distillCalls).toBe(2);
  });
});

// Suppress the unused import lint — `request` is imported only to document the controller's
// http.Request shape consumed by the hover handler.
void request;
