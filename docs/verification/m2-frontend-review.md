# Milestone 2 frontend review fixes

Branch `cursor/m2-frontend-e5e7`. PR #10 was still open when this was recorded, so main was not merged into the branch.

## Commands

- build: `pnpm -F @aria/middleware typecheck` and `pnpm -F @aria/web exec tsc --noEmit`
- unit: `pnpm -F @aria/middleware test`
- integration: `pnpm -F @aria/middleware test` (same vitest run; includes route and company integration tests)
- e2e: `pnpm -F @aria/e2e exec playwright test tests/milestone2-agents.spec.ts --project=chromium-desktop --project=chromium-tablet --project=chromium-mobile --workers=1 --retries=0`

## Before

Recorded on 2026-10-25 at commit `c000d82`, before the review fixes:

- Middleware typecheck passed. Web typecheck passed.
- Middleware eslint passed. Web eslint passed.
- `pnpm -F @aria/middleware test`: 26 files, 137 tests passed.
- `mvn -B -ntp -f apps/backend/pom.xml test`: 44 tests, 0 failures, 1 skipped.
- Playwright, three viewports: 216 passed, including the first milestone 2 spec.
- A live `ticket:updated` payload of `{id,status}` crashed the board, which expected `{ticket}`.
- `GET /projects/:id/budget` counted workspace usage against a project limit.
- Report downloads did not refresh an expired access token.
- `catalogIds` ignored model aliases such as `auto-smart`.

## After

Recorded on 2026-10-27:

- Middleware typecheck passed. Web typecheck passed. Shared package typecheck passed.
- Middleware eslint passed. `next lint` passed.
- `pnpm -F @aria/middleware test`: 28 files, 146 tests passed.
- The new route tests cover the 1,000,000 project limit with 5,000,000 workspace usage (used stays 0), malformed ids, a foreign workspace, `GET /tickets/:id` including archived tickets, the hash chain, reports, log tail paging, and run signals.
- The download test refreshes a 401 and retries the report with the new bearer token.
- `tests/milestone2-agents.spec.ts` passed 3 consecutive times with `--retries=0` on desktop (1920x1080), tablet (768x1024), and mobile (375x667). Each run was 3 passed. The spec checks a live awaiting-merge move, an AI company source, persisted flow owners, streamed logs, cancel within 2 seconds, and a reachable merge-violation stub.
- Java sources were not changed, so the 2026-10-25 Maven result still stands.

## Screenshots

ui_affected: yes

Local Playwright captures from the passing run:

- Board, ticket, runs, settings, company, and projects on desktop and mobile, saved during the spec.

## Logs

- Before: the board threw when the first live ticket update arrived, and a report download after token expiry failed closed.
- After: the milestone 2 spec recorded 0 page errors. A 401 on download stores the refreshed access token and clicks the file link once.

## Summary

The board, budget scope, log paging, and report download now follow one contract. `catalogModelIds` accepts string ids and `{id,aliases}`, which keeps `auto-smart` valid. PR #10 had not merged, so this branch was not rebased onto it.
