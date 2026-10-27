# Milestone 3B — Jira hierarchy + path ownership

Branch `cursor/m3b-jira-ownership-49c8`. Implements M3_PLAN.md rev 4 slice **M3B** (V22). Does not include M3A (V21 providers).

## Commands

- build: `pnpm -F @aria/shared build`, `pnpm -F @aria/db build`, `pnpm -F @aria/middleware exec tsc --noEmit`, `pnpm -F @aria/web exec tsc --noEmit`
- unit: `pnpm -F @aria/middleware exec vitest run src/__tests__/m3b.test.ts`
- integration: `pnpm -F @aria/middleware exec vitest run src/__tests__/m3b.integration.test.ts`
- drift: `node scripts/check-schema-drift.cjs`
- e2e: `pnpm -F @aria/e2e exec playwright test tests/milestone3b-jira.spec.ts --project=chromium-desktop --project=chromium-tablet --project=chromium-mobile --workers=1 --retries=0`

## Before

Recorded on 2026-10-27 at commit `2f5046a` (main) before M3B code:

- `node scripts/check-schema-drift.cjs` passed (V20 was tip).
- `pnpm -F @aria/middleware test`: **25 passed files / 3 failed files**; **141 passed / 5 failed** tests.
- The 5 failures were all `PATCH /api/workspace/llm-config` returning **400** with `id must be a uuid` when saving Cursor model tiers after Test Connection (pre-existing in this environment; unrelated to M3B).
- No V22 migration, no `path_owners`, no `ceilFib`, no sprint APIs, no backlog/sprint board tabs.

## After

(filled after verification)

## Screenshots

ui_affected: yes

## Logs

- Before: llm-config save 400s on integration tests that pin models.
- After: (filled after verification)

## Summary

(filled after verification)
