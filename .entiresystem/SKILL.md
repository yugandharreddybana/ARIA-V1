---
name: aria-meta-skill-index
description: Index of lean agent skills. Canonical role skills live in docs/agents/skills/.
extends: docs/agents/skills/_base.json
version: "1.0.0"
risk_class: A
domains: ["meta"]
---

# ARIA Skill Index

Canonical role skills: `docs/agents/skills/*.json` (see `docs/agents/SKILLS.md`).
Domain skills under `.entiresystem/skills/*/SKILL.md` extend `_base` and alias a role.

## Don't
Alter CORE_VALUES.yml or DESIGN.md.
