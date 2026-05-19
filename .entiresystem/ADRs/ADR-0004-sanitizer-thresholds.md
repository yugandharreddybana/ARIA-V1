# ADR-0004 — Sanitizer thresholds (V27.9 §12)

**Status:** Accepted (Sprint 6)
**Date:** 2026-05-16

## Context
Every untrusted ingress (model output, GitHub webhook body, RSS item, file upload, Horizon Scanner feed) must
pass the two-stage detector. Score thresholds determine the trust label.

## Decision
- **Cleared:** `score < 0.70`
- **Quarantined:** `0.70 ≤ score < 0.90`  (HITL review path)
- **Rejected:** `score ≥ 0.90`            (auto-reject; never executed)
- **Rate guard:** > 20 quarantine events / rolling 60-minute window → defensive auto-reject for the rest of the
  window (`forcedRejectUntil`).
- Heuristic-only by default. When an `OllamaScorer` is injected, the two scores are blended **50/50**.

## Consequences
+ Predictable, testable behavior without LLM availability.
+ Defensive posture limits "flood-the-zone" injection attacks.
+ Blending with the LLM lets a confident "this is safe" model rescue noisy heuristic matches (e.g. legitimate
  prompts about security topics) without compromising the hard floor.
− False-positive rate on prompt-injection literature (e.g. blog posts about jailbreaks) — acceptable; humans
  unblock via HITL.
