# Milestone 3A — multi-provider credentials

Branch `cursor/m3a-providers-3ee9`. Implements M3A (V21) from `docs/milestones/M3_PLAN.md` rev 4. Base: `main` (#9+#11). PR #12 (plan) was still open when this landed; this PR targets `main`.

## Commands

- drift: `node scripts/check-schema-drift.cjs`
- migrate: `DATABASE_URL=postgresql://aria:aria@127.0.0.1:5432/aria_dev node scripts/apply-migrations.cjs`
- build: `pnpm -F @aria/db build` then `pnpm -F @aria/middleware exec tsc --noEmit` and `pnpm -F @aria/web exec tsc --noEmit`
- unit/integration: `pnpm -F @aria/middleware test`
- e2e: `BASE_URL=http://localhost:3000 NEXT_PUBLIC_MIDDLEWARE_URL=http://localhost:3001 ARIA_LLM_MODE=live ARIA_GITHUB_MODE=live pnpm -F @aria/e2e exec playwright test tests/milestone3a-providers.spec.ts tests/milestone1-setup.spec.ts tests/milestone2-agents.spec.ts --project=chromium-desktop --project=chromium-tablet --project=chromium-mobile --workers=1 --retries=0` (with `scripts/provider-stub.mjs` on `:4010` and `CURSOR_API_BASE`/`GITHUB_API_BASE` pointed at it)

## Before

Recorded on 2026-10-27 at `main` tip `2f5046a` (M2 frontend #11), before M3A:

- Schema stopped at Flyway V20. No `provider_credentials` / `runtime_kinds`.
- Single workspace `llm_*` row; `codeWorkerFor()` always Cursor cloud.
- Middleware tests on this environment after M2: **28 files, 146 tests** (PROGRESS / prior verification). Local re-baseline immediately before M3A edits was not re-run on a clean tree; the failing save path against a Hibernate-narrowed `llm_provider` enum only appears once credentials mirror writes `cursor`.
- Playwright M1/M2 setup used `provider-cursor` + `llm-config` Test Connection; Settings had no multi-key editor.
- Coding list was not capability-filtered; Ollama could appear as a coding choice in UI.

## After

Recorded on 2026-10-27 on `cursor/m3a-providers-3ee9`:

- `node scripts/check-schema-drift.cjs` passed (includes `provider_credentials`, `runtime_kinds`, `agent_runs_runtime_fk`).
- V21 applied; `llm_provider` coerced to TEXT when a PG enum was present.
- Middleware + web `tsc --noEmit` passed. Middleware eslint `--max-warnings 0` passed.
- `pnpm -F @aria/middleware test`: **30 files, 157 tests** passed (+2 files, +11 tests vs M2 verification 146). New coverage: `providersForTier` omits Ollama from coding; multi-label encrypt; Test Connection gate; `POST /setup/complete` 409; GET serializers strip `gcm:v2`.
- Playwright, three viewports, retries 0: **9 passed** (M1 setup ×3, M2 agents ×3, M3A providers ×3) in 1.6m against live provider stub.
- M3A spec checks: setup Next disabled until activate; coding list omits `provider-ollama`; Cursor Test Connection activates planning (+ coding when binary ok); Settings multi-label key + model tiers.

## Screenshots

ui_affected: yes (setup model step and Settings providers panel)

Local Playwright failure screenshots from the first stub-less M2 run are discarded; the green run did not attach screenshots (`screenshot: only-on-failure`).

## Logs

- Before: develop runs were not exercised in this branch tip; workspace LLM was a single row.
- After: with stub missing, develop returned `KEY_INVALID` (hit real Cursor). With stub on `:4010`, develop/qa completed to `awaiting_merge`. Credential GET bodies contain no `gcm:v2` ciphertext.

## Summary

M3A delivers multi-provider credentials, adapters, stubs, Test Connection activate gate, capability-filtered lists, and simple setup/Settings UI without touching V22 (M3B). Deviations: live CLI stdout follow remains a thin shim (stub reuses Cursor cloud worker); provider-unhealthy notification table waits for M3E (queue block + key failover ship here).
