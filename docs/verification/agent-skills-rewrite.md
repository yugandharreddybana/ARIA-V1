# Agent skills lean rewrite — verification

Measured: 2026-10-27T11:03:43.010Z
Method: ceil(utf8Bytes/4)
Commit target: PR #18 (catalogue.cjs loader + mapped imperatives).

## Inventory

| Kind | Path |
|---|---|
| Source | `docs/agents/skills/*.json` |
| Runtime | `catalogue.generated.cjs` (CJS; strip-types ESM child OK) |
| Loader | `loadSkills.ts` re-exports catalogue |
| Sync gate | `node scripts/sync-agent-skills.mjs --check` (CI) |
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

## Runtime composed prompt

| Metric | Value |
|---|---:|
| Mean tokens/role | 331 |
| Max tokens/role | 423 |
| Sum (all roles) | 6946 |
| Old template × roles | 3360 |

Composed prompts include mapped hard-rule **imperatives** (not ids only) and `ContextCaps`.

## Tests

- Local middleware vitest: **153 passed**
- `skills:sync --check` OK
- CI unit-tests + typecheck green on 4b4dd86; e2e org-chart click hardened for denser D13 seats

## Hard rules

WIP=1; never merge / user approves ideas; dev/QA md+pdf evidence; hash-chained ticket_events; G/W/T AC; Fib ceil (4d→5); 10-day sprint; ownership/backup/handoff; dep gate; UI mock gate; api_contract; idea lifecycle; red/blue findings→tickets with egress deny-by-default + explicit local allowlist; context load limits; no secrets. Mapped per role.
