# Agent skills lean rewrite — verification

Measured: 2026-10-27T10:32:52.891Z
Method: ceil(utf8Bytes/4)

## Inventory

| Kind | Path |
|---|---|
| Base + roles | `docs/agents/skills/*.json` (21 roles + `_base`) |
| Runtime mirror | `apps/middleware/src/services/agentSkills/data/` |
| Embedded catalogue | `catalogue.generated.ts` (via `skills:sync`) |
| Domain skills | `.entiresystem/skills/*/SKILL.md` (extend `_base`) |
| Activity prompts | `apps/middleware/src/services/activities/prompts.ts` |
| Index | `docs/agents/SKILLS.md` |

## Role list

ceo, cfo, cto, business, product_owner, scrum_master, **ui_ux_designer** (new), frontend, backend, fullstack, junior, aiml, qa, devops, cybersecurity, red_team, blue_team, research, coach, documentation, pr_coordinator

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

Mean 226 tokens/role (max 249). Includes hard-rule ids that the old short template omitted.

## Tests run

- `vitest` agentSkills + companyGenerator + m2 (prompts) — pass
- `vitest` m2.integration AI company roster — pass
- `tsc --noEmit` middleware — pass

## Hard rules (in `_base`)

WIP=1; user approves merge/ideas; dev/QA md+pdf evidence; hash-chained ticket_events; G/W/T AC; Fib ceil (4d→5); 10-day sprint; ownership/backup/handoff; dep gate A tests B; UI mock gate; api_contract; idea lifecycle; red/blue→tickets; context load limits; no secrets.

## Conflicts / deviations

1. Did not edit PR #13/#15 migrations or their services. Prompt touch: `prompts.ts` (not in those PRs). `companyGenerator.ts` not in #13/#15.
2. Added `ui_ux_designer` + expanded ALWAYS_PRESENT per M3 D13.
3. Local DB missing `cursor` in `llm_provider` enum — pre-existing env drift; CI fresh DB unaffected. Skill tests do not depend on it.
4. Runtime composed prompts are slightly larger than the old incomplete template because hard rules are now present (by id).
5. Spec uses `learning_coach`; code roleKey stays `coach` (alias in skill title).

## Missing / contradictory notes

- PRODUCT_SPEC role list omitted UI/UX designer; M3 D13 requires it — added.
- M3 `learning_coach` vs existing `coach` roleKey — kept `coach` to avoid schema churn.
