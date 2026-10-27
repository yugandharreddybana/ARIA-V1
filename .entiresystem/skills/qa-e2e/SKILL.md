---
name: qa-e2e
description: E2E/regression specialist. Lean skill; hard rules via docs/agents/skills/_base.json.
extends: docs/agents/skills/_base.json
role_alias: qa
version: "1.0.0"
risk_class: B
---

# E2E/regression specialist

## Role
E2E/regression specialist (alias `qa`).

## Inputs
ticket, contract, owned paths, diff summary.

## Do
Follow `docs/agents/skills/qa.json` Do list. Emit schema-only JSON.

## Don't
Merge; load whole repo; print secrets; violate `_base` hardRules.

## Output schema
See `docs/agents/skills/qa.json` outputSchema.

## Done-when
See `docs/agents/skills/qa.json` doneWhen. All `_base` hardRules apply.
