import { describe, it, expect } from 'vitest';
import {
  estimateSchema, allocateSchema, procurementSchema, issueCardSchema,
  freezeCardSchema, arbitrageSchema, diplomatSchema,
} from '../schemas/finance.schemas';

describe('finance schemas', () => {
  it('estimate requires uuid sessionId + booleans + non-negative numbers', () => {
    expect(() => estimateSchema.parse({
      sessionId: '11111111-1111-1111-1111-111111111111',
      tokens: 100, computeMinutes: 5, storageGbDays: 0.1, remoteBackend: false,
    })).not.toThrow();
    expect(() => estimateSchema.parse({
      sessionId: 'not-a-uuid', tokens: 0, computeMinutes: 0, storageGbDays: 0, remoteBackend: true,
    })).toThrow();
  });

  it('allocate enforces scope enum', () => {
    expect(() => allocateSchema.parse({
      scope: 'session', scopeRef: '11111111-1111-1111-1111-111111111111', tokens: 1,
    })).not.toThrow();
    expect(() => allocateSchema.parse({
      scope: 'unknown', scopeRef: '11111111-1111-1111-1111-111111111111', tokens: 1,
    })).toThrow();
  });

  it('procurement caps candidates and requirements', () => {
    const many = Array.from({ length: 51 }, () => 'x');
    expect(() => procurementSchema.parse({
      proposedBy: 'u', problem: 'p', category: 'c', requirements: many,
    })).toThrow();
  });

  it('issue card requires positive spend limit', () => {
    expect(() => issueCardSchema.parse({ spendLimitUsd: 0 })).toThrow();
    expect(() => issueCardSchema.parse({ spendLimitUsd: 1 })).not.toThrow();
  });

  it('freeze card requires reason', () => {
    expect(() => freezeCardSchema.parse({ stripeCardId: 'ic_abc' })).toThrow();
    expect(() => freezeCardSchema.parse({ stripeCardId: 'ic_abc', reason: 'fraud' })).not.toThrow();
  });

  it('arbitrage requires non-negative savings + markdown rationale', () => {
    expect(() => arbitrageSchema.parse({
      service: 'postgres', currentProvider: 'aws-rds', candidateProvider: 'gcp-cloudsql',
      monthlySavingsUsd: 100, rationaleMd: 'because cheaper',
    })).not.toThrow();
    expect(() => arbitrageSchema.parse({
      service: 'postgres', currentProvider: 'aws-rds', candidateProvider: 'gcp-cloudsql',
      monthlySavingsUsd: -1, rationaleMd: 'x',
    })).toThrow();
  });

  it('diplomat caps competitors at 10', () => {
    const eleven = Array.from({ length: 11 }, () => 'x');
    expect(() => diplomatSchema.parse({ vendor: 'v', targetUsd: 100, competitors: eleven })).toThrow();
    expect(() => diplomatSchema.parse({ vendor: 'v', targetUsd: 100 })).not.toThrow();
  });
});
