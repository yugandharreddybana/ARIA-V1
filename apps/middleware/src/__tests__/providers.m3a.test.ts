import { describe, expect, it } from 'vitest';
import { detectBinary } from '../services/providers/binary';
import { providersForTier, getProvider, allProviders } from '../services/providers/registry';

describe('M3A providersForTier', () => {
  it('omits non-coding providers from the coding list', () => {
    const coding = providersForTier('coding').map((p) => p.id);
    expect(coding).toEqual(['cursor', 'claude_code', 'codex', 'antigravity']);
    expect(coding).not.toContain('ollama');
    expect(coding).not.toContain('openai');
    expect(coding).not.toContain('gemini');
  });

  it('includes chat and coding providers in planning', () => {
    const planning = providersForTier('planning').map((p) => p.id);
    expect(planning).toContain('ollama');
    expect(planning).toContain('cursor');
    expect(planning).toContain('claude_code');
    expect(planning).toContain('antigravity');
  });

  it('seeds every adapter with canPlan', () => {
    for (const adapter of allProviders()) {
      expect(adapter.canPlan).toBe(true);
    }
  });

  it('documents install steps for CLI coding providers', () => {
    for (const id of ['claude_code', 'codex', 'antigravity'] as const) {
      const adapter = getProvider(id)!;
      expect(adapter.binary).toBeTruthy();
      expect(adapter.installSteps.length).toBeGreaterThan(0);
      expect(adapter.canCode).toBe(true);
    }
  });
});

describe('M3A binary detection', () => {
  it('returns not_required when no binary is configured', () => {
    expect(detectBinary(undefined, [])).toEqual({ status: 'not_required', installSteps: [] });
  });

  it('returns ok in mock mode without installing', () => {
    const previous = process.env.ARIA_LLM_MODE;
    process.env.ARIA_LLM_MODE = 'mock';
    try {
      expect(detectBinary('agy', ['install agy']).status).toBe('ok');
    } finally {
      process.env.ARIA_LLM_MODE = previous;
    }
  });
});
