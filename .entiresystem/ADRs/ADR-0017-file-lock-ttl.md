# ADR-0017 — File lock TTL + holder enforcement (V27.9 §18M)

**Status:** Accepted (Sprint 11)
**Date:** 2026-05-17

## Context
Multiple ARIA agents (or an agent + a human) may target the same file. We need a fast,
fence-able coordination primitive that surfaces in the editor without becoming a stale-lock
problem.

## Decision

- **Storage:** Redis. Key `aria:lock:file:<repoRelPath>`, value
  `<agentId>|<acquiredAt-iso>|<sessionId?>`. `SET NX EX <ttl>` for atomicity.
- **TTL:** clamped to **[5, 600] seconds**. Default 60 s when not specified.
- **Refresh:** holders can extend their own TTL via `POST /api/lsp/locks/refresh`. Refresh
  fails (404) for non-holders.
- **Release:** verifies holder before deleting. An expired holder cannot release a lock
  newly acquired by another agent.
- **Mirror:** every acquire upserts `file_locks` for dashboard / audit visibility. Releases
  delete the mirror row. Redis remains authoritative.
- **Indicator:** the LSP server reports lock state via a custom `aria/lockState` notification
  (Sprint 14 wires the editor decoration).

## Consequences
+ Stale locks self-clean within at most 10 minutes (max TTL).
+ Holder enforcement prevents accidental cross-agent releases.
+ Dashboard can list active locks from Postgres without depending on Redis.
− Two-way sync between Redis + Postgres is best-effort; a Redis outage stops new locks but
  doesn't strand existing rows in the mirror. Sprint 14 adds a reconciler.
