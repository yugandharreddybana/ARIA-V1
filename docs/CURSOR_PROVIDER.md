# Cursor as the planning and coding provider

ARIA's setup wizard defaults to **Cursor**. The official programmatic surface (researched October 2026) is the [Cursor Cloud Agents API](https://cursor.com/docs/cloud-agent/api/endpoints), a public beta at `https://api.cursor.com`, plus `@cursor/sdk` `1.0.40` for local planning runs.

## Two surfaces

| Surface | Used for | How |
|---|---|---|
| Local planning | Knowledge map, company generation, code review | A child process. Env is only `PATH`, `HOME` (`$ARIA_DATA_DIR/cursor-home`), `LANG`, and `CURSOR_API_KEY`. `mode: plan`. Tools are `read`, `grep`, `glob`, `ls`, or none for company generation. `settingSources: []`. Isolated `HOME`. |
| Cloud Agents REST v1 | Develop, fix, QA | `fetch`, not the SDK. `autoCreatePR: true`. Client `agentId` is `bc-` plus the `agent_runs` id. Progress is SSE with `Last-Event-ID`, and `410` falls back to `GET /v1/agents/{id}`. |

`complete()` for provider `cursor` still throws `CURSOR_NO_CHAT_API`. Cursor has no chat-completions API. Planning does not go through that function. Coding does not either.

`ARIA_CURSOR_LOCAL_MODE=stub` (the CI and vitest default) makes the child return fixture text and never calls the network. Stub mode is refused when `NODE_ENV=production`. The live child does not import `@cursor/sdk` yet: a live planning run returns a short stub sentence until that import is wired. `pnpm -F @aria/middleware smoke:cursor` skips with exit 0 when `CURSOR_API_KEY` is unset, and otherwise calls `GET /v1/models`. It is owner-run, not CI.

## Agents never merge

ARIA's GitHub token is a fine-grained PAT with Contents read and Pull requests write. It cannot merge or push. `githubRequest()` throws `MERGE_FORBIDDEN` before any fetch for a merge path, a `/merges` call, or a ref update. Reviews are posted only as `event: "COMMENT"`. The type does not allow `APPROVE`.

Before a coding run, ARIA checks that the default branch is protected. `ARIA_MERGE_GUARD_MODE=block` (the default) refuses the run until the owner acknowledges the gap (`POST /api/projects/:id/github-guard/ack`). `warn` only records it. A GitHub ruleset should restrict updates on the default branch to the owner, require a PR, and block force-push. Do not require approvals on that ruleset when the key is a user key (`ARIA_CURSOR_KEY_TYPE=user`, the default): the PR is authored by the owner, and a required approval would block the owner from approving their own PR. A service-account key is the other config value; REST authorship is still the user until that path exists.

`ARIA_LOCAL_FALLBACK` defaults to `off`. A repo Cursor cannot see (`REPO_ACCESS`) blocks the run. There is no local worktree push in this milestone.

## Evidence the coding and QA runs must leave

The develop prompt requires `evidence/<ticket-key>/dev-report.md` with Commands, Before, After, Screenshots, Logs, and Summary, including build, unit, integration, and e2e results before and after the change. When the change touches UI, the prompt requires Playwright screenshots. The QA prompt requires `evidence/<ticket-key>/qa-report.md` with previous versus current behaviour, the diff, scenarios, regression, screenshots, and a pass/fail verdict.

ARIA stores the Markdown and renders a PDF with pdfkit (no Chromium in CI). A ticket cannot enter `awaiting_merge` until both latest reports validate. Downloads are `GET /api/tickets/:id/reports/{dev|qa}.{md|pdf}`, scoped to the workspace. `ARIA_QA_BROWSER` and `ARIA_SECURITY_REVIEW` stay off. The visual-regression suite is M3.

## Budget and models

Reserves use monthly `token_ledger` buckets, `uuidv5(scopeId:YYYY-MM)`. The workspace cap is `ARIA_MONTHLY_TOKEN_BUDGET` (default 20,000,000 tokens). Planning prefers the catalog's top model. Development prefers `auto-smart`, then `auto`. `auto-smart` is sent on the wire only when that id was stored.

## Local tests without a real key

`ARIA_LLM_MODE=mock` and `ARIA_GITHUB_MODE=mock` skip the network when `NODE_ENV` is not `production`. To exercise HTTP, point `CURSOR_API_BASE` and `GITHUB_API_BASE` at `node scripts/provider-stub.mjs` (vitest global setup does this). The stub accepts any bearer token. Prompt markers `[[stub:ok]]`, `[[stub:error]]`, `[[stub:no_pr]]`, `[[stub:no_changes]]`, `[[stub:stream_410]]`, `[[stub:slow]]`, `[[stub:usage=N]]`, `[[stub:repo_access]]`, and `[[stub:no_report]]` pick the scenario. Merge endpoints return 418 and increment `GET /__stub/violations`.

## If Cursor ships a completions API later

Add a `complete()` branch in `apps/middleware/src/services/llmProvider.service.ts` and route it through `completeThroughGateway`. Do not call Cursor from a controller. Coding stays on the Cloud Agents API.
