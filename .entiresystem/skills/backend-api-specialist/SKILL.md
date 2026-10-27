---
name: backend-api-specialist
description: API/data specialist. Lean skill; hard rules via docs/agents/skills/_base.json.
extends: docs/agents/skills/_base.json
role_alias: backend
version: "1.0.0"
risk_class: B
---

# API/data specialist

## Role
API/data specialist (alias `backend`).

## Inputs
ticket, contract, owned paths, diff summary.

## Do
Follow `docs/agents/skills/backend.json` Do list. Emit schema-only JSON.

## Don't
Merge; load whole repo; print secrets; violate `_base` hardRules.

## Output schema
See `docs/agents/skills/backend.json` outputSchema.

## Done-when
See `docs/agents/skills/backend.json` doneWhen. All `_base` hardRules apply.
