# ADR-0003 — Token Gateway lives in the Node middleware

**Status:** Accepted (Sprint 5)
**Date:** 2026-05-16
**Deciders:** Owner; V27.9 §18H anchor

## Context
V27.9 §18H requires every LLM call to route through a single Token Gateway that enforces queue priorities,
session budgets, rolling rate-limit windows, and ReplayFrame capture. The Gateway can live in the Node
middleware or the Java backend.

## Decision
Host the Token Gateway in the **Node middleware** (`apps/middleware/src/services/tokenGateway.service.ts`).
Java orchestrator calls `POST /api/llm/invoke` via HTTP when it needs LLM output. The WebSocket hub
(also in middleware) bridges Gateway events (`token.warn`, `token.hard_stop`, `queue.depth`) to the
browser without an extra hop.

## Consequences
+ Single place to enforce rate limits, JWT auth, and CORS.
+ Reuses existing `express-rate-limit` + `requireAuth` infra.
+ ReplayFrame writes go straight to the same Postgres pool the rest of the middleware uses.
− One more HTTP hop when the Java backend needs Claude — acceptable; LLM latency dwarfs the hop.
− Java services must depend on the middleware being up. Fine in local-first; explicit health-check gates this.
