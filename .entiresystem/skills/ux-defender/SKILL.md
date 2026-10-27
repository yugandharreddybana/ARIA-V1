---
name: ux-defender
description: UX quality defender. Lean skill; hard rules via docs/agents/skills/_base.json.
extends: docs/agents/skills/_base.json
role_alias: ui_ux_designer
version: "1.0.0"
risk_class: B
---

# UX quality defender

## Role
UX quality defender (alias `ui_ux_designer`).

## Inputs
ticket, contract, owned paths, diff summary.

## Do
Follow `docs/agents/skills/ui_ux_designer.json` Do list. Emit schema-only JSON.

## Don't
Merge; load whole repo; print secrets; violate `_base` hardRules.

## Output schema
See `docs/agents/skills/ui_ux_designer.json` outputSchema.

## Done-when
See `docs/agents/skills/ui_ux_designer.json` doneWhen. All `_base` hardRules apply.
