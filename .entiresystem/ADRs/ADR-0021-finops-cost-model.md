# ADR-0021 — FinOps Oracle cost-model coefficients (V27.9 §11)

**Status:** Accepted (Sprint 13)
**Date:** 2026-05-18

## Context
The FinOps Oracle gates every `/startwork` call with a cost estimate. Coefficients need to be
reviewable, version-controlled, and easy to tune as real spend data lands in Sprint 14.

## Decision
The cost model is fixed-coefficient and deterministic — no LLM call. All amounts in USD.

```
total_usd =
    tokens          * token_usd_per_kilo / 1_000
  + compute_minutes * compute_usd_per_minute
  + storage_gb_days * storage_usd_per_gb_day
  + third_party_usd
```

Coefficient pairs (`token_usd_per_kilo`) differ by backend mix:

| Backend | token_usd_per_kilo |
|---------|--------------------|
| `local` (Ollama) | **0.0000** — free |
| `remote` (Anthropic Sonnet) | **3.0000** — placeholder until Sprint 14 hooks a live pricing dial |

Other coefficients (shared):

| Coefficient | Value (USD) |
|-------------|-------------|
| `compute_usd_per_minute`  | **0.0100** |
| `storage_usd_per_gb_day`  | **0.0008** |

Gate rule:
- Per-session budgets carry both a token cap and an implicit USD ceiling ($100k sanity bound).
- Projected tokens = `tokens_used + tokens_reserved + new_estimate`. Compare to
  `tokens_allocated * hard_stop_ratio` (default 0.95).
- USD projection = `(compute + storage + third_party USD recorded so far) + estimate.total_usd`.
- Allow only if both checks pass.

## Consequences
+ Estimator is pure-function — exhaustively unit-testable in `FinOpsOracleServiceTest`.
+ Coefficient changes show up in `git diff` of this file alone.
+ Local-vs-remote split keeps Ollama-heavy sessions cheap by default while still surfacing the
  real cost when Anthropic kicks in.
− Coefficient values are placeholders until Sprint 14 wires a live pricing source. Re-tune in
  ADR-0021-rev2 with the Golden Dataset data in hand.
− USD sanity bound ($100k) is a hard floor against runaway sessions; per-tenant overrides will
  land in Sprint 17 when Meta-Evolution observes real usage.
