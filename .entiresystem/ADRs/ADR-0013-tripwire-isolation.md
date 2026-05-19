# ADR-0013 — Semantic Tripwire isolation rules

**Status:** Accepted (Sprint 9)
**Date:** 2026-05-16

## Context
V27.9 §17 calls for Semantic Tripwires — honeypot rows / columns that are NEVER referenced by
production code paths. Reads of a tripwire are a signal that an attacker (or a buggy agent) is
poking around tables it shouldn't be touching.

## Decision
- Tripwires are stored in `semantic_tripwires` (Sprint 9 schema) — one row per honeypot.
- Tripwires are only ever **installed into Synthetic Hydrator profiles** (Sprint 14 `red_team`
  + `qa` profiles), never into production data.
- Each tripwire has a unique `honeypot` string (e.g. `__aria_tripwire_v1__`); production code
  is forbidden (Anti-Slop P0 + CI grep) from referencing that string.
- When a tripwire is read in the sandbox, the read handler updates `triggered_at` and posts a
  P1 incident to the IncidentCommander (`source: tripwire`).

## Consequences
+ Cheap, high-signal anomaly detection — no false positives if the install + read code paths
  are correctly partitioned.
+ Composable with the Sprint 14 Synthetic Hydrator (tripwires are just one more synthetic data
  decoration).
− Requires CI discipline to grep production code for the magic strings on every PR. The
  Anti-Slop Gate already does this in Sprint 6, so we extend its rule set in Sprint 14.
