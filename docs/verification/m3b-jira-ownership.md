# Milestone 3B — Jira hierarchy + path ownership

Branch `cursor/m3b-jira-ownership-49c8`. Implements M3_PLAN.md rev 4 slice **M3B** (V22). Does not include M3A (V21 providers).

## Commands

- build: `pnpm -F @aria/shared build`, `pnpm -F @aria/db build`, `pnpm -F @aria/middleware exec tsc --noEmit`, `pnpm -F @aria/web exec tsc --noEmit`
- unit: `pnpm -F @aria/middleware exec vitest run src/__tests__/m3b.test.ts`
- integration: `pnpm -F @aria/middleware exec vitest run src/__tests__/m3b.integration.test.ts`
- drift: `node scripts/check-schema-drift.cjs`
- e2e: `BASE_URL=http://127.0.0.1:3000 pnpm -F @aria/e2e exec playwright test tests/milestone3b-jira.spec.ts --project=chromium-desktop --project=chromium-tablet --project=chromium-mobile --workers=1 --retries=0`
- full middleware: `pnpm -F @aria/middleware exec vitest run`

## Before

Recorded on 2026-10-27 at commit `2f5046a` (main) before M3B code:

- `node scripts/check-schema-drift.cjs` passed (V20 was tip).
- Main CI was green on that commit.
- Locally, `pnpm -F @aria/middleware test` showed **141 passed / 5 failed**. Those 5 were a **local Postgres `llm_provider` enum** issue (missing `cursor` / related values), fixed locally with `ALTER TYPE … ADD VALUE` — unrelated to M3B and not present on main CI.
- No V22 migration, no `path_owners`, no `ceilFib` / `daysToPoints`, no sprint APIs, no backlog/sprint board tabs.

## After

Recorded on 2026-10-27 on `cursor/m3b-jira-ownership-49c8` after M3B (and follow-up AC / CI / ownership fixes):

| Suite | Result |
|---|---|
| `m3b.test.ts` + `m3b.integration.test.ts` | unit + integration (incl. OFF→backup and WIP→backup) |
| `check-schema-drift.cjs` | **passed** (V22 tip) |
| Full middleware `vitest run` | green |
| Playwright M3B × desktop/tablet/mobile | green |
| CI Playwright (includes `milestone3b-jira.spec.ts` + M2) | green after AC seed + CI list fix |

Local env notes (not product code):

- Dev rate limit raised so sequential full setup flows do not 429 mid-suite.
- Playwright `BASE_URL=http://127.0.0.1:3000` aligned with middleware CORS / `NEXT_PUBLIC_MIDDLEWARE_URL`.

## Screenshots

ui_affected: yes

Artifacts under `/opt/cursor/artifacts/` (also retained from the run):

- `m3b-backlog-{desktop,tablet,mobile}.png`
- `m3b-sprint-{desktop,tablet,mobile}.png`
- `m3b-board-card-{desktop,tablet,mobile}.png`
- `m3b-story-detail-{desktop,tablet,mobile}.png`

## Logs

- Before: local llm-config enum 400s only (main CI green).
- After: middleware + Playwright + drift green; see CI run on PR #13.

## Summary

M3B delivers Flyway **V22** + Drizzle mirrors for epic/story/sub-task hierarchy, Given/When/Then acceptance criteria (Zod), Fibonacci points via single `daysToPoints` (ceilFib alias), working-day due dates, 10-working-day sprints, `path_owners` with backup handoff (OFF and WIP) + `ticket_events`, WIP=1, nullable `idea_card_id`, and a simple backlog / sprint / board UI with owner + AC + sub-tasks. Create/approve UI requires AC; approve errors surface on the card. M3A (V21 providers) untouched.

### Deviations from M3_PLAN.md rev 4 (M3B slice)

1. Project timezone / `sprint_workdays` columns remain M3A V21; M3B uses env `ARIA_SPRINT_WORKDAYS=10` and `ARIA_AGENT_WIP_LIMIT=1`.
2. No dedicated Ownership settings tab / git-diff path inference UI (M3D/G); ownership is established via merge predicted paths + path-owner APIs.
3. Mobile sprint form uses column layout so the create button is not covered by field hit-targets under the mobile chrome.
4. Day→points uses owner-confirmed ceilFib inside `daysToPoints` (1→1, 2→2, 3→3, 4→5, 5→5, 8→8).
