# ARIA agent skills (lean)

Canonical prompts for every company role. Shared hard rules live once in `_base`; role files extend it.

## Inventory (this repo)

| Location | What |
|---|---|
| `docs/agents/skills/_base.json` | Shared hard rules + context/model policy (human index) |
| `docs/agents/skills/<roleKey>.json` | Per-role Role / Inputs / Do / Don't / Output schema / Done-when |
| `apps/middleware/src/services/agentSkills/data/` | **Runtime copy** (must match docs; child processes load via `__dirname`) |
| `apps/middleware/src/services/agentSkills/` | Loader + `composeInstructions` used by company generation |
| `apps/middleware/src/services/companyGenerator.ts` | Seeds seats; instructions from lean skills |
| `apps/middleware/src/services/activities/prompts.ts` | Dev / QA / review activity prompts (reference `_base` ids) |
| `.entiresystem/skills/*/SKILL.md` | Domain skills; each `extends` `_base` and aliases a role |
| `.entiresystem/SKILL.md` | Meta index stub |

Open PRs **#13** (M3B / V22) and **#15** (M3A / V21) do not own these skill paths; this change avoids their migrations/services.

## Roles (ROLE_KEYS)

| roleKey | Tier | Notes |
|---|---|---|
| `ceo` | high | Idea value decisions |
| `cfo` | high | Cost/value; spend caps |
| `cto` | high | Architecture / risk |
| `business` | high | Market / AI opportunities |
| `product_owner` | high | G/W/T AC, story_split, ceilFib |
| `scrum_master` | high | Ceremonies, WIP=1, 10-day sprint |
| `ui_ux_designer` | high | HTML+PNG every state; mock gate (M3 D13 — was missing) |
| `frontend` | low | UI + contract + dev evidence |
| `backend` | low | API/data + contract + evidence |
| `fullstack` | low | Both layers |
| `junior` | low | Smallest change |
| `aiml` | low | Model integration via gateway |
| `qa` | low | Prev-vs-current + screenshots md+pdf |
| `devops` | low | CI / env |
| `cybersecurity` | high | security_review → tickets |
| `red_team` | high | Local allowlist only; findings → tickets |
| `blue_team` | low | Fix findings |
| `research` | high | Idea research + sources |
| `coach` | high | Learning proposals; owner approve |
| `documentation` | low | `confluence/` docs |
| `pr_coordinator` | high | Merge-order advice; never merges |

Always seeded (OFF if no seat): `ui_ux_designer`, `documentation`, `pr_coordinator`, `research`, `coach`, `red_team`, `blue_team`.

## Structure (every role skill)

1. **Role** — title + `roleKey`
2. **Inputs** — ticket / contract / owned paths only
3. **Do** — job steps
4. **Don't** — merge, whole-repo load, secrets, …
5. **Output schema** — strict JSON Schema
6. **Done-when** — exit criteria
7. **extends: `_base`** — hard rules by reference

## Measure

```bash
node scripts/count-skill-tokens.mjs
```

Writes `docs/agents/token-report.json`. Tests: `apps/middleware/src/__tests__/agentSkills.test.ts`.
