# ADR-0015 — Deadlock Breaker timeout + Contract Forcing Event (V27.9 §18I)

**Status:** Accepted (Sprint 10)
**Date:** 2026-05-17

## Context
The Deadlock Breaker is the safety valve for circular agent dependencies. Two questions
need answers up front:

1. **How long** before a cycle is considered a true deadlock (vs transient waiting)?
2. **Who** drafts the V1 contract that breaks the cycle?

## Decision

### Timeout

`DEADLOCK_TIMEOUT = 3 minutes` (`Duration.ofMinutes(3)`).

Justification: most legitimate agent waits resolve under 90 seconds in the Sprint 1–9 pipelines.
Anything past 3 minutes correlates strongly with a circular dependency in the historical data
we have (Sprint 14 Golden Dataset will validate). Tunable per workload via
`DeadlockBreakerService.DEADLOCK_TIMEOUT` (constant; behind ADR re-vote).

Heartbeat window: 2 minutes (`HEARTBEAT_WINDOW`). Any agent whose last heartbeat is older
than this is treated as offline and excluded from the wait graph.

### Producer election

The **first agent in the detected cycle** (traversal order, starting from the earliest-waiting
agent) is the producer. Rationale: it is by construction the upstream node — every other
agent in the cycle is waiting transitively on it.

The producer is prompted to draft a V1 contract; consumers are prompted to accept the V1 draft
as a temporary contract. A `ContractDebt` row is created with `reconciliation_required = true`
so Sprint 14 reconciliation flow can drive the cycle to a real contract.

Sprint 10 ships the row creation + auditing. The actual prompt-based V1 draft generation runs
through the Token Gateway in Sprint 17 (Meta-Evolution) when the LLM-backed contract drafting
work lands.

## Consequences
+ 3-minute timeout is conservative — fewer false deadlocks, marginally longer wait when a real
  deadlock occurs. Tune via the Golden Dataset run in Sprint 14.
+ Audit trail (`contract_debts`) makes every forced V1 a reviewable artefact rather than an
  invisible nudge.
− Producer-is-first-in-cycle is a heuristic. Multi-cycle graphs (rare but possible) may pick a
  sub-optimal producer; Sprint 17 Meta-Evolution will re-tune.
