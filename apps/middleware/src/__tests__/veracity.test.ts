import { describe, it, expect } from 'vitest';
import { score, rank, auditSkill, VERACITY_CONFIG } from '../services/veracity.service';
import type { SkillExperience } from '../services/experience.service';

const NOW = new Date('2026-05-16T00:00:00Z');

describe('Knowledge Veracity', () => {
  it('human-authored entries never decay', () => {
    const r = score('human-authored', '2020-01-01T00:00:00Z', NOW);
    expect(r.score).toBe(VERACITY_CONFIG['human-authored'].weight);
  });

  it('ai-only entries decay by half every 30 days', () => {
    const fresh = score('ai-only', NOW.toISOString(), NOW);
    const thirtyDays = new Date(NOW.getTime() - 30 * 86_400_000).toISOString();
    const old = score('ai-only', thirtyDays, NOW);
    expect(fresh.score).toBeCloseTo(VERACITY_CONFIG['ai-only'].weight, 5);
    expect(old.score).toBeCloseTo(VERACITY_CONFIG['ai-only'].weight / 2, 5);
  });

  it('rank() orders entries by score descending', () => {
    const items = [
      { text: 'stale ai', veracity: 'ai-only' as const, captured_at: new Date(NOW.getTime() - 90 * 86_400_000).toISOString() },
      { text: 'fresh human', veracity: 'human-authored' as const, captured_at: '2020-01-01T00:00:00Z' },
      { text: 'mid approved', veracity: 'human-approved' as const, captured_at: new Date(NOW.getTime() - 365 * 86_400_000).toISOString() },
    ];
    const ranked = rank(items, NOW);
    expect(ranked[0].entry.text).toBe('fresh human');
    expect(ranked[ranked.length - 1].entry.text).toBe('stale ai');
  });

  it('auditSkill flags stale ai-only entries below 10% of weight', () => {
    const exp: SkillExperience = {
      skill: 'x', tickets_touched: 0,
      best_practices: [{ text: 'stale', veracity: 'ai-only', captured_at: new Date(NOW.getTime() - 200 * 86_400_000).toISOString() }],
      anti_patterns: [],
      failure_stories: [],
    };
    const audit = auditSkill(exp, NOW);
    expect(audit.byVeracity['ai-only']).toBe(1);
    expect(audit.staleAiOnly.length).toBe(1);
  });

  it('auditSkill counts each veracity tag correctly', () => {
    const exp: SkillExperience = {
      skill: 'x', tickets_touched: 0,
      best_practices: [
        { text: 'a', veracity: 'human-authored', captured_at: NOW.toISOString() },
        { text: 'b', veracity: 'human-approved', captured_at: NOW.toISOString() },
      ],
      anti_patterns: [{ text: 'c', veracity: 'ai-only', captured_at: NOW.toISOString() }],
      failure_stories: [],
    };
    const audit = auditSkill(exp, NOW);
    expect(audit.totalEntries).toBe(3);
    expect(audit.byVeracity).toMatchObject({ 'human-authored': 1, 'human-approved': 1, 'ai-only': 1 });
  });
});
