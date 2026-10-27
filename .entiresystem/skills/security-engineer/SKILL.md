---
name: security-engineer
description: AppSec specialist. Lean skill; hard rules via docs/agents/skills/_base.json.
extends: docs/agents/skills/_base.json
role_alias: cybersecurity
version: "1.0.0"
risk_class: B
---

# AppSec specialist

## Role
AppSec specialist (alias `cybersecurity`).

## Inputs
ticket, contract, owned paths, diff summary.

## Do
Follow `docs/agents/skills/cybersecurity.json` Do list. Emit schema-only JSON.

## Don't
Merge; load whole repo; print secrets; violate `_base` hardRules.

## Output schema
See `docs/agents/skills/cybersecurity.json` outputSchema.

## Done-when
See `docs/agents/skills/cybersecurity.json` doneWhen. All `_base` hardRules apply.
