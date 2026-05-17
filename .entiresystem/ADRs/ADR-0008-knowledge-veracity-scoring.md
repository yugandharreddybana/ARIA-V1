# ADR-0008 — Knowledge Veracity scoring

**Status:** Accepted (Sprint 7)
**Date:** 2026-05-16

## Context
V27.9 §6 requires every lesson to carry a veracity tag so Meta-Evolution (Sprint 17) and the Concept Graph
ranker (Sprint 8) can downweight unverified, auto-extracted notes without losing them entirely.

## Decision
Three tags, exponential-decay weights:

| Tag             | Weight | Half-life | Notes                                                            |
|-----------------|--------|-----------|------------------------------------------------------------------|
| human-authored  | 1.0    | ∞         | Written by a human reviewer. Never auto-modified.                |
| human-approved  | 0.8    | 365 days  | Drafted by an agent, accepted by a human via PR review.          |
| ai-only         | 0.3    | 30 days   | Extracted by Shadow Learning; advisory until a human promotes it.|

Score formula: `weight × 0.5^(age_days / half_life)`.

Audit thresholds (`auditSkill`):
- `staleAiOnly`         — `ai-only`   entries with current score < 0.10
- `staleHumanApproved`  — `human-approved` entries with current score < 0.50

The `knowledge-audit` CLI surfaces these per skill. Sprint 17 hooks Meta-Evolution into the same audit to
propose pruning PRs for stale entries.

## Consequences
+ Auto-extracted Shadow Learning drafts age out unless promoted, preventing pollution.
+ Human-authored entries are immutable signals (lessons learned the hard way stay surfaced).
+ Linear, transparent ranking — easy to debug why an entry showed up in a prompt.
− Tag is required on every entry. The `ExperienceService.append*` helpers default to `ai-only` for safety so
  agents cannot accidentally promote their own writes.
