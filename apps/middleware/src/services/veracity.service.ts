/**
 * Knowledge Veracity scoring (V27.9 §6 / ADR-0008).
 *
 * Each EXPERIENCE.md / experience.yml entry carries a `veracity` tag:
 *   - human-authored : weight 1.0, never decays
 *   - human-approved : weight 0.8, decays slowly (half-life 365 days)
 *   - ai-only        : weight 0.3, decays fast (half-life 30 days)
 *
 * The current score for an entry is `weight * 0.5^(age_days / half_life)`.
 * Meta-Evolution (Sprint 17) and the Knowledge Graph Architect (Sprint 8) use these
 * scores to rank which lessons to surface during prompt assembly.
 */

import type { Veracity, ExperienceEntry, FailureStory, SkillExperience } from './experience.service';

interface VeracityConfig { weight: number; halfLifeDays: number }

export const VERACITY_CONFIG: Record<Veracity, VeracityConfig> = {
  'human-authored': { weight: 1.0, halfLifeDays: Infinity },
  'human-approved': { weight: 0.8, halfLifeDays: 365 },
  'ai-only':        { weight: 0.3, halfLifeDays: 30 },
};

export interface ScoredEntry<T> {
  entry: T;
  score: number;
  ageDays: number;
  veracity: Veracity;
}

export function score(veracity: Veracity, capturedAt: string, now: Date = new Date()): { score: number; ageDays: number } {
  const cfg = VERACITY_CONFIG[veracity] ?? VERACITY_CONFIG['ai-only'];
  const captured = new Date(capturedAt);
  const ageMs = Math.max(0, now.getTime() - captured.getTime());
  const ageDays = ageMs / 86_400_000;
  if (!Number.isFinite(cfg.halfLifeDays)) return { score: cfg.weight, ageDays };
  const decay = Math.pow(0.5, ageDays / cfg.halfLifeDays);
  return { score: cfg.weight * decay, ageDays };
}

export function rank<T extends ExperienceEntry | FailureStory>(items: T[], now: Date = new Date()): ScoredEntry<T>[] {
  return items
    .map(entry => {
      const { score: s, ageDays } = score(entry.veracity, entry.captured_at, now);
      return { entry, score: s, ageDays, veracity: entry.veracity };
    })
    .sort((a, b) => b.score - a.score);
}

export interface VeracityAudit {
  skill: string;
  totalEntries: number;
  byVeracity: Record<Veracity, number>;
  staleAiOnly: ScoredEntry<ExperienceEntry | FailureStory>[];
  staleHumanApproved: ScoredEntry<ExperienceEntry | FailureStory>[];
}

const STALE_AI_THRESHOLD = 0.10;          // any ai-only entry decayed below 30% of weight (~52 days)
const STALE_HUMAN_THRESHOLD = 0.5;        // any human-approved entry decayed below 50% (~ half-life)

export function auditSkill(exp: SkillExperience, now: Date = new Date()): VeracityAudit {
  const all: Array<ExperienceEntry | FailureStory> = [
    ...exp.best_practices, ...exp.anti_patterns, ...exp.failure_stories,
  ];
  const byVeracity: Record<Veracity, number> = { 'human-authored': 0, 'human-approved': 0, 'ai-only': 0 };
  for (const e of all) byVeracity[e.veracity] = (byVeracity[e.veracity] ?? 0) + 1;

  const ranked = rank(all, now);
  return {
    skill: exp.skill,
    totalEntries: all.length,
    byVeracity,
    staleAiOnly:       ranked.filter(r => r.veracity === 'ai-only'        && r.score < STALE_AI_THRESHOLD),
    staleHumanApproved: ranked.filter(r => r.veracity === 'human-approved' && r.score < STALE_HUMAN_THRESHOLD),
  };
}
