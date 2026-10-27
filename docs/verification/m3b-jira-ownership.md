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
- `pnpm -F @aria/middleware test`: **25 passed files / 3 failed files**; **141 passed / 5 failed** tests.
- The 5 failures were all `PATCH /api/workspace/llm-config` returning **400** with `id must be a uuid` when saving Cursor model tiers after Test Connection (pre-existing Postgres `llm_provider` enum missing `cursor` / related values in this environment; unrelated to M3B schema).
- No V22 migration, no `path_owners`, no `ceilFib`, no sprint APIs, no backlog/sprint board tabs.

## After

Recorded on 2026-10-27 on `cursor/m3b-jira-ownership-49c8` after M3B + local env repair (`ALTER TYPE llm_provider ADD VALUE` for missing providers; `RATE_LIMIT_MAX=10000` for e2e):

| Suite | Result |
|---|---|
| `m3b.test.ts` + `m3b.integration.test.ts` | **2 files / 13 tests passed** |
| `check-schema-drift.cjs` | **passed** (V22 tip) |
| Full middleware `vitest run` | **30 files / 159 tests passed** (0 failed) |
| Playwright M3B × desktop/tablet/mobile | **3 passed** (18.9s) |

Local env notes (not product code):

- Postgres enum extended so llm-config PATCH succeeds (clears the 5 pre-existing Before failures).
- Dev rate limit raised so three sequential full setup flows do not 429 mid-suite.
- Playwright `BASE_URL=http://127.0.0.1:3000` aligned with middleware CORS / `NEXT_PUBLIC_MIDDLEWARE_URL`.

## Screenshots

ui_affected: yes

Artifacts under `/opt/cursor/artifacts/` (also retained from the run):

- `m3b-backlog-{desktop,tablet,mobile}.png`
- `m3b-sprint-{desktop,tablet,mobile}.png`
- `m3b-board-card-{desktop,tablet,mobile}.png`
- `m3b-story-detail-{desktop,tablet,mobile}.png`

## Logs

- Before: llm-config save 400s on integration tests that pin models (`m3b-before-middleware-test.log`).
- After: full middleware green (`m3b-after-middleware-test.log`); Playwright green (`m3b-playwright.log`); drift green (`m3b-drift.log`).

## Summary

M3B delivers Flyway **V22** + Drizzle mirrors for epic/story/sub-task hierarchy, Given/When/Then acceptance criteria (Zod), Fibonacci points with `ceilFib` + working-day due dates, 10-working-day sprints, `path_owners` with backup handoff + `ticket_events`, WIP=1, nullable `idea_card_id`, and a simple backlog / sprint / board UI with owner + AC + sub-tasks. M3A (V21 providers) untouched.

### Deviations from M3_PLAN.md rev 4 (M3B slice)

1. Project timezone / `sprint_workdays` columns remain M3A V21; M3B uses env `ARIA_SPRINT_WORKDAYS=10` and `ARIA_AGENT_WIP_LIMIT=1`.
2. No dedicated Ownership settings tab / git-diff path inference UI (M3D/G); ownership is established via merge predicted paths + path-owner APIs.
3. Mobile sprint form uses column layout so the create button is not covered by field hit-targets under the mobile chrome.
