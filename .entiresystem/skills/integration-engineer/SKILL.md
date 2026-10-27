---
name: integration-engineer
description: Integration specialist. Lean skill; hard rules via docs/agents/skills/_base.json.
extends: docs/agents/skills/_base.json
role_alias: fullstack
version: "1.0.0"
risk_class: B
---

# Integration specialist

## Role
Integration specialist (alias `fullstack`).

## Inputs
ticket, contract, owned paths, diff summary.

## Do
Follow `docs/agents/skills/fullstack.json` Do list. Emit schema-only JSON.

## Don't
Merge; load whole repo; print secrets; violate `_base` hardRules.

## Output schema
See `docs/agents/skills/fullstack.json` outputSchema.

## Done-when
See `docs/agents/skills/fullstack.json` doneWhen. All `_base` hardRules apply.
