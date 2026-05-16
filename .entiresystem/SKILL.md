---
name: aria-meta-skill-index
description: Top-level index of all SKILL.md files registered for this product (Sprint 11 lazy-loads the full catalogue).
trigger_keywords: ["skill", "index", "registry"]
risk_class: A
domains: ["meta"]
source: local
version: "0.1.0"
---

# ARIA Skill Index (stub)

The full skill catalogue is built in Sprint 11 (Phase 11 — Skill Ecosystem).
This stub exists so the FIM has a tracked file to sign from Sprint 6 onward.

## Transparency Card

optimizes_for:
  - Discoverability of agent skills

hard_constraints:
  - Never alter CORE_VALUES.yml or DESIGN.md.

typical_inputs:
  - "list skills", "find a skill for X"

typical_outputs:
  - SKILL.md paths and frontmatter summaries.

allowed_actions:
  - Read SKILL.md files.

forbidden_actions:
  - Install or modify any skill (delegated to Sprint 11 Talent Acquisition / Quarantine).
