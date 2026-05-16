# ADR-0005 — Anti-Slop axes & scoring (V27.9 §14)

**Status:** Accepted (Sprint 6)
**Date:** 2026-05-16

## Context
DESIGN.md is law. Every UI artifact must defend its presence on the page. We need an automatable
"will this embarrass us in prod?" gate before human review.

## Decision
Five axes, each starting at 2 points (10 total):

| Axis        | What it measures                                                  |
|-------------|-------------------------------------------------------------------|
| Philosophy  | Does the component have a coherent reason to exist?               |
| Hierarchy   | Are headings, landmarks, and reading order correct?               |
| Execution   | Are tokens/spacing/colors derived from DESIGN.md?                 |
| Specificity | Is the language exact (no TODOs, no `any`, no magic strings)?     |
| Restraint   | No console.log, no multiple shadows, no unnecessary motion.       |

Severity penalties: **P0 = 2.0**, **P1 = 1.0**, **P2 = 0.25**.

Gate:
- Any **P0** finding → hard fail, regardless of total score.
- Total score < 6 (out of 10) → fail.

The rule list is in `apps/middleware/src/services/antiSlop.service.ts`. New rules require an ADR amendment.

## Consequences
+ Cheap CI step (regex over diff) with zero external deps.
+ Designers + engineers share one objective rubric.
− Regex-based detection misses some semantic violations; future Sprint 14 work pairs this with a model-based
  visual grader for richer signals.
