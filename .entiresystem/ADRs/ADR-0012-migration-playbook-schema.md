# ADR-0012 — Zero-Downtime Migration Playbook schema + rollback rules

**Status:** Accepted (Sprint 9)
**Date:** 2026-05-16

## Context
V27.9 §17 forbids automatic rollback of stateful_dangerous phases once real traffic has flowed.
We need a YAML format that makes the rollback class explicit per phase and a runner that
honours it deterministically.

## Decision
Playbook shape:

```yaml
name: <slug>
phases:
  - name: <human-readable>
    rollback_type: stateless_safe | stateful_dangerous | irreversible
    tests:    [ "smoke test names" ]
    metrics:  [ "metric names to observe between phases" ]
```

Runner rules:
- `stateless_safe`    : auto-rollback on failure (status `rolled_back`).
- `stateful_dangerous`: NEVER auto-rollback after real data flows; halt with `failed` status
  and human review required.
- `irreversible`      : NEVER rolls back; halt with `failed` status, escalate to Incident
  Commander as P0.

Between phases, a `HealthGate` callback decides whether to advance. Default in Sprint 9 is
`ALWAYS_OK`; Sprint 14 wires Datadog/Prometheus checks.

## Consequences
+ The YAML is the single, signed contract — `signed_hash` (sha256) + `signed_by` recorded in
  `migration_playbooks` for audit.
+ Runner is dependency-free (parses YAML with a small structural reader); easy to unit test.
− Custom YAML parser is intentionally minimal — comments and anchors are not supported. Sprint 14
  swaps to SnakeYAML once the chaos sandbox image carries the lib.
