import { describe, it, expect } from 'vitest';
import { distillSchema, preflightSchema } from '../schemas/distill.schemas';
import { _resetEnvCacheForTests } from '../config/env';
import { resetPgPoolForTests } from '../services/db.client';
import { preFlight } from '../services/distill.service';

describe('distill schemas', () => {
  it('accepts a valid distill payload with strict mode', () => {
    const parsed = distillSchema.parse({
      projectId: '11111111-1111-1111-1111-111111111111',
      agentId: 'backend-api-specialist',
      taskDescription: 'Refactor the session start endpoint to add an audit log.',
    });
    expect(parsed.agentId).toBe('backend-api-specialist');
  });

  it('rejects unknown keys (mass-assignment defence)', () => {
    expect(() => distillSchema.parse({
      projectId: '11111111-1111-1111-1111-111111111111',
      agentId: 'x',
      taskDescription: 't',
      isAdmin: true,
    })).toThrow();
  });

  it('rejects negative rawPromptTokens', () => {
    expect(() => preflightSchema.parse({
      projectId: '11111111-1111-1111-1111-111111111111',
      agentId: 'x',
      rawPromptTokens: -1,
    })).toThrow();
  });

  it('preflight accepts a 0-token sentinel (useful for cold-start budget probes)', () => {
    const parsed = preflightSchema.parse({
      projectId: '11111111-1111-1111-1111-111111111111',
      agentId: 'cold',
      rawPromptTokens: 0,
    });
    expect(parsed.rawPromptTokens).toBe(0);
  });
});

describe('preFlight estimator fallback', () => {
  // The estimator returns DEFAULT_RATIO when the table is absent. We stub the pool with a
  // thrower to exercise that branch without spinning up Postgres.
  it('falls back to DEFAULT_RATIO (1.0) when distillation_runs is unreachable', async () => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://localhost:1/aria_no_db_for_test';
    _resetEnvCacheForTests();
    resetPgPoolForTests();
    try {
      const r = await preFlight({
        projectId: '11111111-1111-1111-1111-111111111111',
        agentId: 'qa',
        rawPromptTokens: 800,
      });
      expect(r.compressionRatio).toBe(1.0);
      expect(r.projectedTokens).toBe(800);
      expect(r.sampleCount).toBe(0);
    } finally {
      process.env.DATABASE_URL = previous;
      _resetEnvCacheForTests();
      resetPgPoolForTests();
    }
  });
});
