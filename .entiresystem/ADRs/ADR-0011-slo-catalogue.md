# ADR-0011 — SLO catalogue + breach severity mapping

**Status:** Accepted (Sprint 9)
**Date:** 2026-05-16

## Context
V27.9 §17 requires SLOs per service with deterministic breach detection feeding the Incident
Commander. We need the catalogue committed to git so reviewers can audit it without DB access.

## Decision
- The canonical SLO catalogue lives in `.entiresystem/slos.yml` (committed).
- IncidentCommander syncs the file into `slo_definitions` on boot.
- Breach severity mapping:

| Condition                                                   | Severity |
|-------------------------------------------------------------|----------|
| Availability < 99% over 5 min                                | **P0**   |
| Availability < 99.5% over 5 min                              | **P1**   |
| p95 latency > 2× threshold sustained 5 min                   | **P1**   |
| p95 latency > threshold sustained 5 min                      | **P2**   |
| Token Gateway queue depth p95 > 40 (cap 50)                  | **P2**   |
| Concept Graph summary coverage < 80%                         | **P2**   |
| Concept Graph summary coverage < 95% but ≥ 80%               | **P3**   |

- Each entry has a `window_seconds` so the breach detector knows the rolling window length.

## Consequences
+ One YAML file is the single source of truth for "what does healthy mean here?".
+ Reviewable in PRs — SLO changes require an ADR amendment.
+ IncidentCommander only ever reads from `slo_definitions`; the YAML sync is one-way.
− YAML drift is possible if someone edits the table directly; mitigated by Sprint 14 adding a
  startup check that fails the daemon if the table and file diverge.
