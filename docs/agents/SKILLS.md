# ARIA agent skills (lean)

Canonical prompts for every company role. Shared hard rules live once in `_base`; each role lists **applicable** `hardRuleIds` and numeric `contextCaps`.

## Single source of truth

| Path | Role |
|---|---|
| `docs/agents/skills/*.json` | **Source** — edit here |
| `apps/middleware/src/services/agentSkills/catalogue.generated.cjs` | Runtime embed (CJS; works in vitest + strip-types ESM child) |
| `apps/middleware/src/services/agentSkills/catalogue.generated.d.cts` | Types for the embed |
| `apps/middleware/src/services/agentSkills/loadSkills.ts` | Re-exports the embed (one loader) |
| `scripts/sync-agent-skills.mjs` | Generate embed; `--check` fails CI on drift |

```bash
pnpm skills:sync          # write catalogue from docs
pnpm skills:sync --check  # CI drift gate
pnpm skills:tokens        # before/after token table
```

## Structure (every role skill)

1. **Role** / `roleKey`
2. **hardRuleIds** — mapped subset of `_base` (coding rules not sent to CFO, etc.)
3. **contextCaps** — `{ maxFiles, maxBytes, maxTokens }`
4. **Inputs / Do / Don't / Output schema / Done-when**
5. **extends: `_base`**

Composed prompts inject a one-line imperative per mapped rule (not bare ids).

## Roles

| roleKey | Tier |
|---|---|
| `ceo` `cfo` `cto` `business` `product_owner` `scrum_master` `ui_ux_designer` | high |
| `frontend` `backend` `fullstack` `junior` `aiml` `qa` `devops` | low |
| `cybersecurity` `red_team` | high |
| `blue_team` `research` `coach` `documentation` `pr_coordinator` | mixed |

Always seeded (OFF if no seat): `ui_ux_designer`, `documentation`, `pr_coordinator`, `research`, `coach`, `red_team`, `blue_team`.
