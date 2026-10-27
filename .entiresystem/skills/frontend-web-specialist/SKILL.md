---
name: frontend-web-specialist
description: Next.js/React UI specialist. Lean skill; hard rules via docs/agents/skills/_base.json.
extends: docs/agents/skills/_base.json
role_alias: frontend
version: "1.0.0"
risk_class: B
---

# Next.js/React UI specialist

## Role
Next.js/React UI specialist (alias `frontend`).

## Inputs
ticket, contract, owned paths, diff summary.

## Do
Follow `docs/agents/skills/frontend.json` Do list. Emit schema-only JSON.

## Don't
Merge; load whole repo; print secrets; violate `_base` hardRules.

## Output schema
See `docs/agents/skills/frontend.json` outputSchema.

## Done-when
See `docs/agents/skills/frontend.json` doneWhen. All `_base` hardRules apply.
