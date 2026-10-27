---
name: compliance-auditor
description: Compliance auditor. Lean skill; hard rules via docs/agents/skills/_base.json.
extends: docs/agents/skills/_base.json
role_alias: cybersecurity
version: "1.0.0"
risk_class: B
---

# Compliance auditor

## Role
Compliance auditor (alias `cybersecurity`).

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
