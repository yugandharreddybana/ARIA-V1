# ADR-0010 — Distillation ranking weights + compression target

**Status:** Accepted (Sprint 8)
**Date:** 2026-05-16

## Context
V27.9 §18N requires that the `DistillationEngine` produces a payload that compresses raw context
by **≥5×** on representative corpora without dropping safety-critical hints (DESIGN tokens, security
constraints, governing ADRs). The ranking rubric has to be transparent — agents and humans should
both be able to understand why a chunk made it into the prompt.

## Decision
Score formula per Level-1 chunk:

```
score(chunk) =
    3.0 × #keyword-hits-in-symbol_name
  + 2.0 × #keyword-hits-in-summary
  + 1.0 × #keyword-hits-in-source_file
  + 0.5  if chunk.last_updated_at within the last 24h
```

Selection rules:
- Drop chunks with `score = 0`.
- Sort descending; cap each bucket per the request DTO:
  - `affectedSymbols`  default **8**
  - `moduleContext`    default **5**
  - `domainConcepts`   default **5**
  - `governingDecisions` default **3**
- Always include the `experience_notes` + `anti_patterns` from the affected skill (top-3 by
  veracity score, sourced from `ExperienceService.read(slug)` in the middleware).

Token accounting:
- `rawTokensWouldHaveBeen` = Σ ( `summary.length / 4 + 1` + `(line_end − line_start) × 8` ).
- `totalTokensEstimated`   = Σ `summary.length / 4 + 1` for chosen buckets.
- `compressionRatio`       = `raw / total` (≥5× target; surfaced in `distillation_runs`).

Pre-Flight Estimator (middleware) uses a 20-sample moving average of `compression_ratio` per
(project, agent) to project the actual token cost of an upcoming LLM call. When the table is
empty (cold start) the estimator returns `1.0` so the Token Gateway behaves as if no
distillation happened (safe upper bound).

## Consequences
+ Deterministic, debug-friendly ranking — no hidden ML model surprises.
+ Tunable per project once we see real corpora (weights live in the engine, not the spec).
+ Pre-Flight Estimator can refuse underfunded sessions BEFORE dispatch.
− Bag-of-words ranking misses semantic equivalence (e.g. "rotate" vs "rolling"). Sprint 14 adds
  embedding-based re-ranking as a second pass behind a feature flag once Golden Dataset shows the
  current weights regressing.
− Recency bump can over-weight chunks touched in noisy refactor commits. Re-tune after the
  Sprint 14 Golden Dataset run.
