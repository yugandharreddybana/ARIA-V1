# ADR-0022 — Token reservation diff strategy (V27.9 §11 + §18H)

**Status:** Accepted (Sprint 13)
**Date:** 2026-05-18

## Context
Parallel fan-out (many agents working on the same epic) can race past a session token budget if
each agent independently consumes tokens. The Token Gateway reserves estimated tokens up front;
Sprint 13 formalises the reconciliation rule.

## Decision

```
acquire(estimate):
    budget.tokens_reserved += estimate

complete(actual, original_estimate):
    budget.tokens_used     += actual
    budget.tokens_reserved -= original_estimate    # always — never use `actual` here

fail(original_estimate):
    budget.tokens_reserved -= original_estimate
```

Key invariants:
- `tokens_reserved` only ever moves by the **original estimate**, never by `actual`. This
  prevents drift when actual > estimate (the overshoot is absorbed by `tokens_used`, not
  by silently relaxing future reservations).
- `tokens_reserved` is clamped at 0 — a failed reconcile can never push it negative.
- Pre-flight estimator (ADR-0010) uses the rolling distillation compression ratio to project
  `actual` from `raw_prompt_tokens` so the gateway can reject obviously over-budget calls
  before any reservation is taken.

Schema fields used:
- `budgets.tokens_allocated` — set once via `/api/finance/finops/allocate`.
- `budgets.tokens_used`      — running spend.
- `budgets.tokens_reserved`  — running in-flight reservations.
- `budgets.hard_stop_ratio`  — multiplied by `tokens_allocated` to get the hard cap.

## Consequences
+ Fan-out is safe: every concurrent acquire takes a slot before any LLM call leaves the gateway.
+ Drift is self-correcting — overshoots show up immediately in `tokens_used`, not in a
  silent slack on `tokens_reserved`.
+ Easy to reason about + test (`FinOpsOracleServiceTest` covers the reservation arithmetic).
− Bursty workloads can starve themselves if estimates are systematically too high. Sprint 14
  Pre-Flight Estimator + ADR-0010 compression ratio average mitigates this by lowering the
  per-call estimate as we see more actuals.
