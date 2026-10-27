---
name: knowledge-graph-architect
description: Knowledge graph specialist. Lean skill; hard rules via docs/agents/skills/_base.json.
extends: docs/agents/skills/_base.json
role_alias: aiml
version: "1.0.0"
risk_class: B
---

# Knowledge graph specialist

## Role
Knowledge graph specialist (alias `aiml`).

## Inputs
ticket, contract, owned paths, diff summary.

## Do
Follow `docs/agents/skills/aiml.json` Do list. Emit schema-only JSON.

## Don't
Merge; load whole repo; print secrets; violate `_base` hardRules.

## Output schema
See `docs/agents/skills/aiml.json` outputSchema.

## Done-when
See `docs/agents/skills/aiml.json` doneWhen. All `_base` hardRules apply.
