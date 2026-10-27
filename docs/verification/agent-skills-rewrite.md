# Agent skills lean rewrite — verification

Measured: 2026-10-27T12:18:56.134Z
Method: ceil(utf8Bytes/4)
PR #18 @ ea2ff61 — CI green (unit-tests, typecheck, e2e ×3).

## Inventory

| Kind | Path |
|---|---|
| Source of truth | `docs/agents/skills/*.json` |
| Runtime catalogue | `apps/middleware/src/services/agentSkills/catalogue.generated.cjs` |
| One loader | `loadSkills.ts` re-exports catalogue |
| Drift gate | `node scripts/sync-agent-skills.mjs --check` (CI typecheck + unit-tests) |
| Domain skills | `.entiresystem/skills/*/SKILL.md` extend `_base` |
| Index | `docs/agents/SKILLS.md` |

## Role list (21)

ceo, cfo, cto, business, product_owner, scrum_master, ui_ux_designer, frontend, backend, fullstack, junior, aiml, qa, devops, cybersecurity, red_team, blue_team, research, coach, documentation, pr_coordinator

## Token before/after (rewritten existing files)

| File | Before | After | Saved |
|---|---:|---:|---:|
| `activities/prompts.ts` | 698 | 693 | 5 |
| `.entiresystem/skills/backend-api-specialist` | 494 | 166 | 328 |
| `.entiresystem/skills/compliance-auditor` | 346 | 172 | 174 |
| `.entiresystem/skills/db-specialist` | 424 | 164 | 260 |
| `.entiresystem/skills/devops-engineer` | 362 | 168 | 194 |
| `.entiresystem/skills/finops-oracle` | 376 | 157 | 219 |
| `.entiresystem/skills/frontend-web-specialist` | 411 | 174 | 237 |
| `.entiresystem/skills/historian` | 441 | 173 | 268 |
| `.entiresystem/skills/integration-engineer` | 382 | 170 | 212 |
| `.entiresystem/skills/knowledge-graph-architect` | 419 | 168 | 251 |
| `.entiresystem/skills/qa-e2e` | 405 | 160 | 245 |
| `.entiresystem/skills/security-engineer` | 476 | 171 | 305 |
| `.entiresystem/skills/ux-defender` | 377 | 172 | 205 |
| `.entiresystem/SKILL.md` | 217 | 113 | 104 |
| **TOTAL** | **5828** | **2821** | **3007 (51.6%)** |

## Runtime composed prompt (with mapped imperatives + context caps)

| Metric | Value |
|---|---:|
| Mean tokens/role | 331 |
| Max tokens/role | 423 |
| Sum (all 21 roles) | 6946 |
| Old incomplete template × 21 | 3360 |

## Review fixes verified

1. catalogue.generated.cjs loads in CJS vitest and strip-types ESM child (no fs path).
2. skills:sync --check + docs↔catalogue test.
3. Hard-rule imperatives injected per role map (CFO lacks coding evidence rules).
4. Checklist asserts on composed prompts; applyContextCaps truncates.
5. red/blue egress deny-by-default + explicit local allowlist.
6. CI green including e2e desktop/tablet/mobile.
