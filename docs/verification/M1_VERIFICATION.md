# Milestone 1 end-to-end verification

Independent check of `main` at `2f5046a` (Milestone 2 frontend #11 — project rename/archive — on top of the M2 agent-runs backend, simplified UI, and M2 plan). The feature list comes from `docs/PRODUCT_SPEC.md` steps 1–7 and the model-tiering section. Steps 8–15 are later milestones and were not implemented here. Harness run on verification branch tip `b70d876`.

> **Screenshots:** relative `screenshots/*.png` links in this file are not committed to git (they 404 on GitHub). Full-size PNGs are published as the CI artifact **`m1-verification-screenshots`** from the e2e job. This PDF embeds downscaled copies of those same shots.

Checked on 2026-10-27 against a local stack. Browser flows used `http://localhost:3000` at 1920×1080, 768×1024, and 375×667. API flows called the middleware on `127.0.0.1:3001`.

## Stack

Docker Compose brought up Postgres 16 with pgvector (`pgvector/pgvector:pg16`, container `aria-postgres`, database `aria_dev`) and Redis 7 (`aria-redis`). Flyway V1–V20 were applied. `node scripts/check-schema-drift.cjs` passed.

The Java backend, middleware, and web app ran on the host so they could reach the loopback stub:

- Java 21 Spring Boot on port 8080 (`GET /api/health` healthy).
- Middleware on `127.0.0.1:3001` with `ARIA_LLM_MODE=live` and `ARIA_GITHUB_MODE=live` (`OPENAI_API_BASE` / `NVIDIA_API_BASE` = `http://127.0.0.1:4010/v1`).
- Next.js on port 3000. `NEXT_PUBLIC_MIDDLEWARE_URL=http://localhost:3001`.
- `scripts/provider-stub.mjs` on `127.0.0.1:4010` for Cursor, OpenAI, Anthropic, NVIDIA, Ollama, OpenAI-compatible, and GitHub. The stub catalog includes a planning id and a standard id for each of those providers, plus `GET /api/tags`.

Opening the site at `http://127.0.0.1:3000` fails the CORS preflight, because `CORS_ORIGINS` is `http://localhost:3000`. Verification used `localhost`.

## Harness result

`scripts/m1-verify.mjs` drove the API and the three browser sizes.

| Result | Count |
| --- | --- |
| pass | 137 |
| fixed | 6 |
| deferred | 0 |
| fail | 0 |
| rows | 143 |

No deferred rows. `PATCH /api/projects/:id` returns 200 with the renamed body. The projects page exposes `data-testid="rename-project"` and `archive-project` at every viewport. `DELETE /api/projects/:id` archives the row and passed.

## Bugs fixed on this branch

1. **Signup and other callers showed "Validation failed" instead of the field message.** The API returns Zod issues in `details`. `messageFromApiBody` in `apps/web/src/lib/api.ts` prefers the first detail message. Covered by a Vitest unit test on `messageFromApiBody` and by `apps/e2e/tests/m1-validation-message.spec.ts`. Screenshot (full-size): CI artifact `m1-verification-screenshots`; embedded in the PDF at a lower resolution.

2. **An expired access token sent the user to login while the refresh cookie was still valid.** `POST /api/auth/refresh` already worked. On a 401, `api()` / `authorizedFetch` refreshes once and retries. Login, signup, refresh, and logout are matched on pathname (query string ignored). An in-flight refresh cannot rewrite the token after `abandonSession()` (logout). If the stored token already changed after the failing request was sent, the client replays without a second refresh. Failing test: `apps/e2e/tests/m1-session-refresh.spec.ts` (asserts `/api/auth/refresh` ran and `aria_token` changed). After sign-in the app lands on `/projects`.

3. **An unknown model id was accepted after a catalog refresh.** Test Connection stores model ids as strings. `resolveForRun` later rewrites `llm_model_catalog` as `{ id }` objects. `updateModelTiers` only kept strings, so the catalog looked empty and any id was saved. `catalogModelIds` reads both shapes, including aliases. Failing test first: `apps/middleware/src/__tests__/reviewFixes.integration.test.ts`. The mobile company page now returns HTTP 422 and shows the catalog error.

Middleware already treats `ANTHROPIC_ENABLED=false` as off on `main`. The unused `@aria/config` package was left unchanged. Project rename/archive UI and `PATCH /api/projects/:id` shipped in #11 and are asserted by this harness.

The extra stub model ids are verification support so live-mode Test Connection can see both tier models. They are not a product change.

## What was exercised

- Signup, duplicate email, weak password, short name, login, wrong password, logout, HttpOnly `aria_refresh`, revoked refresh after logout.
- Garbage bearer token rejected. Refresh cookie issues a new access token. With `localStorage` set to `not-a-jwt`, the projects page stays signed in.
- Create project from the API and from the projects page. Empty, loading, and error states. The projects page offers setup. Signup lands on `/setup`. Login lands on `/projects`. Rename and archive controls are present on project cards.
- User B cannot read, list, or archive user A's project, cannot read the knowledge map, and has no GitHub token.
- Test Connection for Cursor, OpenAI, Anthropic, NVIDIA, Ollama, OpenAI-compatible, and custom against the stub. Gemini and Groq fail closed against their real hosts. `aria-mock-key` is not a live-mode bypass. An unknown Ollama model is rejected. Saving Cursor stores `claude-opus-5` and `auto` and does not echo the key. The setup UI repeats the success/failure matrix on desktop.
- Repo names must be `owner/name`. `../secret` is rejected. A stub token lists `acme/demo-app`. A token shorter than 8 characters cannot list repos. Analysis produces Signup, Login, Homepage, and Auth API.
- Company sizes 3, 10, 12, and 40 return HTTP 202 when a workspace model is configured (the template is applied and a company-generation run is queued). ON seats match the size. Documentation and the PR coordinator always exist: OFF below 12, ON at 12 and above. Size 3 and 10 include CEO and CTO. Size 12 and 40 also include CFO. Sizes 2 and 41 are rejected.
- Org chart on all three sizes: view, edit instructions, toggle an agent OFF and back ON, add a seat, confirm delete. Flow owner can be changed in the chart and by the API. A backup is stored. An owner from another project is rejected. Deleting the owner promotes the backup.
- Regeneration with an open ticket returns 409 and keeps the same agent ids. `force: true` returns 202 and replaces the org. Legacy `POST /api/projects/:id/skills` returns 410.
- Model tiers: an id outside the tested catalog is rejected, including when the stored catalog is `{ id, aliases }`. `claude-opus-5` / `auto` can be pinned. The UI can move development to the top tier. An unknown id shows an error on desktop, tablet, and mobile.

## Could not verify

| Item | Why |
| --- | --- |
| Gemini Test Connection success | The host is hardcoded to Google. No API key. Failure (HTTP 400 / 422) was verified. |
| Groq Test Connection success | The host is hardcoded to Groq. No API key. Credential rejection was verified. |
| A real Cursor key, and Cursor chat completions | No Cursor key. The stub proves key check and model listing. Completions still throw `CURSOR_NO_CHAT_API` by design. |
| Real GitHub OAuth or a real personal access token | No GitHub app credentials or PAT. The stub issued `acme/demo-app` and the connect-plus-analysis path ran against that. |
| Compose-built app containers and a real Ollama model | Postgres and Redis came from Compose. The apps ran on the host so they could reach the loopback stub. |

## Existing suite

Run on this branch after merging `main` at `2f5046a` (#11) and the verification harness/assert fixes.

| Check | Result |
| --- | --- |
| `pnpm -F @aria/middleware test` (Vitest) | 29 files, 148 tests passed (post-#11) |
| `pnpm -F @aria/web` api unit tests | 8 passed |
| `mvn -B -ntp -f apps/backend/pom.xml test` | 44 tests, 0 failures, 1 skipped (`AriaBackendApplicationTests`) |
| `pnpm -F @aria/middleware typecheck` | passed |
| `pnpm -F @aria/web exec tsc --noEmit` | passed |
| Playwright `m1-validation-message` + `m1-session-refresh` × 3 viewports | 6 passed |
| `scripts/m1-verify.mjs` (this report) | 137 pass, 6 fixed, 0 deferred, 0 fail |

## Checklist

| Feature | Scenario | Result | Evidence |
| --- | --- | --- | --- |
| Stack | middleware health | pass | API HTTP 200 |
| Stack | Java backend health | pass | API HTTP 200 |
| Stack | provider stub /v1/me | pass | API HTTP 200 |
| Signup | API creates account and returns an access token | pass | API HTTP 201 |
| Signup | duplicate email rejected | pass | API HTTP 409 |
| Signup | weak password rejected | pass | API HTTP 400 |
| Login | wrong password rejected | pass | API HTTP 401 |
| Login | valid password returns a token and an HttpOnly refresh cookie | pass | API HTTP 200 |
| Session | access token reads the current user | pass | API HTTP 200 |
| Session | missing token is rejected | pass | API HTTP 401 |
| Session | garbage access token is rejected | pass | API HTTP 401 |
| Session | refresh cookie issues a new access token | pass | API HTTP 200 |
| Logout | refresh cookie is revoked | pass | API logout 200 refresh 401 |
| Projects | create project | pass | API HTTP 201 |
| Projects | edit project name | pass | API HTTP 200 name=Renamed Shop |
| Authorization | user B cannot read user A project | pass | API HTTP 404 |
| Authorization | user B project list hides user A | pass | API HTTP 200 |
| Projects | delete archives the project | pass | API delete 204 status archived |
| Authorization | user B cannot archive user A project | pass | API HTTP 404 |
| LLM providers | cursor Test Connection against the stub | pass | API HTTP 200 Cursor API key verified. Planning model claude-opus-5. Auto model auto. This key cannot run chat completions. |
| LLM providers | openai Test Connection against the stub | pass | API HTTP 200 openai connection succeeded. Planning model gpt-4.1. Standard model gpt-4.1-mini. |
| LLM providers | anthropic Test Connection against the stub | pass | API HTTP 200 anthropic connection succeeded. Planning model claude-opus-4-7. Standard model claude-sonnet-4-6. |
| LLM providers | nvidia Test Connection against the stub | pass | API HTTP 200 nvidia connection succeeded. Planning model nvidia/llama-3.1-nemotron-70b-instruct. Standard model meta/llama-3.1-8b-instruct. |
| LLM providers | ollama Test Connection against the stub | pass | API HTTP 200 ollama connection succeeded. Planning model qwen2.5-coder:7b. Standard model nomic-embed-text. |
| LLM providers | openai_compatible Test Connection against the stub | pass | API HTTP 200 openai_compatible connection succeeded. Planning model local-model. Standard model claude-opus-5. |
| LLM providers | custom Test Connection against the stub | pass | API HTTP 200 custom connection succeeded. Planning model local-model. Standard model claude-opus-5. |
| LLM providers | gemini Test Connection without a real key fails closed | pass | API HTTP 422 Provider returned HTTP 400 |
| LLM providers | groq Test Connection without a real key fails closed | pass | API HTTP 422 Credentials were rejected |
| LLM providers | live mode does not treat aria-mock-key as a mock success | pass | API HTTP 422 Provider returned HTTP 400 |
| Model validation | unknown Ollama model is rejected | pass | API Provider returned HTTP 404 |
| LLM providers | saving Cursor stores tier ids and hides the key | pass | API HTTP 200 top=claude-opus-5 auto=auto |
| GitHub | repo name that is not owner/name is rejected | pass | API HTTP 400 |
| GitHub | repo name with .. is rejected | pass | API HTTP 400 |
| Model tiers | model id outside the tested catalog is rejected | pass | API HTTP 422 |
| Model tiers | catalog ids can be pinned | pass | API HTTP 200 |
| GitHub | token connects and lists the stub repo | pass | API token 200 repos 200 |
| Authorization | user B has no GitHub token | pass | API HTTP 400 |
| GitHub | connecting a listed repo queues analysis | pass | API HTTP 201 |
| Knowledge map | analysis builds flows for signup, login, and the homepage | pass | API Signup, Login, Homepage, Auth API |
| Authorization | user B cannot read the knowledge map | pass | API HTTP 404 |
| Company | size 3 counts ON seats and always includes docs + PR coordinator | pass | API HTTP 202 on=3 docs=false pr=false |
| Company | size 10 counts ON seats and always includes docs + PR coordinator | pass | API HTTP 202 on=10 docs=false pr=false |
| Company | size 12 counts ON seats and always includes docs + PR coordinator | pass | API HTTP 202 on=12 docs=true pr=true |
| Company | size 40 counts ON seats and always includes docs + PR coordinator | pass | API HTTP 202 on=40 docs=true pr=true |
| Company | size below 3 and above 40 is rejected | pass | API 400/400 |
| Flow ownership | owner and backup can be reassigned on the same project | pass | API HTTP 200 |
| Flow ownership | an owner from another project is rejected | pass | API HTTP 400 |
| Flow ownership | deleting the owner promotes the backup | pass | API delete 204 owner true |
| Company | regeneration without force returns 409 and keeps the org | pass | API ticket 201 regen 409 |
| Company | forced regeneration replaces the org in one response | pass | API HTTP 202 on=8 |
| Company | legacy unvalidated skill create returns 410 | pass | API HTTP 410 |
| Landing | home page renders (desktop) | pass | [landing-desktop.png](screenshots/landing-desktop.png) |
| Signup | name shorter than 2 characters is rejected (desktop) | fixed | [signup-validation-desktop.png](screenshots/signup-validation-desktop.png) Name must be at least 2 characters |
| Signup | account lands on setup (desktop) | pass | [signup-dashboard-desktop.png](screenshots/signup-dashboard-desktop.png) |
| Projects | empty state (desktop) | pass | [projects-empty-desktop.png](screenshots/projects-empty-desktop.png) |
| Projects | loading state (desktop) | pass | [projects-loading-desktop.png](screenshots/projects-loading-desktop.png) |
| Projects | error state (desktop) | pass | [projects-error-desktop.png](screenshots/projects-error-desktop.png) |
| Setup | projects page offers setup (desktop) | pass | [dashboard-empty-desktop.png](screenshots/dashboard-empty-desktop.png) |
| LLM providers | provider picker (desktop) | pass | [providers-desktop.png](screenshots/providers-desktop.png) |
| LLM providers | cursor Test Connection success in the setup UI | pass | [provider-cursor-ok.png](screenshots/provider-cursor-ok.png) Cursor API key verified. Planning model claude-opus-5. Auto model auto. This key cannot run chat completions. |
| LLM providers | openai Test Connection success in the setup UI | pass | [provider-openai-ok.png](screenshots/provider-openai-ok.png) openai connection succeeded. Planning model gpt-4.1. Standard model gpt-4.1-mini. |
| LLM providers | anthropic Test Connection success in the setup UI | pass | [provider-anthropic-ok.png](screenshots/provider-anthropic-ok.png) anthropic connection succeeded. Planning model claude-opus-4-7. Standard model claude-sonnet-4-6. |
| LLM providers | ollama Test Connection success in the setup UI | pass | [provider-ollama-ok.png](screenshots/provider-ollama-ok.png) ollama connection succeeded. Planning model qwen2.5-coder:7b. Standard model nomic-embed-text. |
| LLM providers | openai_compatible Test Connection success in the setup UI | pass | [provider-openai_compatible-ok.png](screenshots/provider-openai_compatible-ok.png) openai_compatible connection succeeded. Planning model local-model. Standard model claude-opus-5. |
| LLM providers | gemini Test Connection failure in the setup UI | pass | [provider-gemini-fail.png](screenshots/provider-gemini-fail.png) Provider returned HTTP 400 |
| LLM providers | groq Test Connection failure in the setup UI | pass | [provider-groq-fail.png](screenshots/provider-groq-fail.png) Credentials were rejected |
| LLM providers | ollama Test Connection failure in the setup UI | pass | [provider-ollama-fail.png](screenshots/provider-ollama-fail.png) Connection failed: fetch failed |
| GitHub | token shorter than 8 characters cannot list repos (desktop) | pass | [github-short-token-desktop.png](screenshots/github-short-token-desktop.png) |
| GitHub | stub repo is listed (desktop) | pass | [github-repos-desktop.png](screenshots/github-repos-desktop.png) |
| Knowledge map | setup shows the map (desktop) | pass | [knowledge-desktop.png](screenshots/knowledge-desktop.png) |
| Company | generation finishes and offers the org chart (desktop) | pass | [company-ready-desktop.png](screenshots/company-ready-desktop.png) |
| Org chart | chart, documentation, and PR coordinator are visible (desktop) | pass | [org-chart-desktop.png](screenshots/org-chart-desktop.png) docs=Caleb Nguyen Documentation Lead OFF pr=Harun Demir PR Merge Coordinator OFF |
| Org chart | edit instructions (desktop) | pass | [org-edit-desktop.png](screenshots/org-edit-desktop.png) |
| Org chart | toggle CEO off (desktop) | pass | [org-toggle-desktop.png](screenshots/org-toggle-desktop.png) |
| Org chart | toggle CEO back on (desktop) | pass | [org-toggle-on-desktop.png](screenshots/org-toggle-on-desktop.png) |
| Org chart | add an agent (desktop) | pass | [org-add-desktop.png](screenshots/org-add-desktop.png) |
| Org chart | delete asks for confirmation (desktop) | pass | [org-delete-confirm-desktop.png](screenshots/org-delete-confirm-desktop.png) |
| Org chart | confirmed delete removes the agent (desktop) | pass | [org-deleted-desktop.png](screenshots/org-deleted-desktop.png) |
| Flow ownership | owner select changes in the org chart (desktop) | pass | [flow-owner-desktop.png](screenshots/flow-owner-desktop.png) before=3da03f14-8ac4-4c43-a209-1c3ea4cde12b |
| Model tiers | unknown model id shows an error (desktop) | pass | [tiers-invalid-desktop.png](screenshots/tiers-invalid-desktop.png) HTTP 422 Model not-a-real-model is not in the provider catalog from Test Connection |
| Model tiers | valid tier change is saved (desktop) | pass | [tiers-saved-desktop.png](screenshots/tiers-saved-desktop.png) |
| Projects | create from the projects page (desktop) | pass | [projects-created-desktop.png](screenshots/projects-created-desktop.png) |
| Projects | edit and delete controls on the projects page (desktop) | pass | [projects-edit-delete-desktop.png](screenshots/projects-edit-delete-desktop.png) rename=2 archive=2 |
| Logout | sign out returns to login (desktop) | pass | [logout-desktop.png](screenshots/logout-desktop.png) |
| Login | wrong password shows an error (desktop) | pass | [login-error-desktop.png](screenshots/login-error-desktop.png) |
| Login | valid password returns to projects (desktop) | pass | [login-ok-desktop.png](screenshots/login-ok-desktop.png) |
| Session | expired access token is refreshed from the cookie (desktop) | fixed | [session-expiry-desktop.png](screenshots/session-expiry-desktop.png) http://localhost:3000/projects |
| Landing | home page renders (tablet) | pass | [landing-tablet.png](screenshots/landing-tablet.png) |
| Signup | name shorter than 2 characters is rejected (tablet) | fixed | [signup-validation-tablet.png](screenshots/signup-validation-tablet.png) Name must be at least 2 characters |
| Signup | account lands on setup (tablet) | pass | [signup-dashboard-tablet.png](screenshots/signup-dashboard-tablet.png) |
| Projects | empty state (tablet) | pass | [projects-empty-tablet.png](screenshots/projects-empty-tablet.png) |
| Projects | loading state (tablet) | pass | [projects-loading-tablet.png](screenshots/projects-loading-tablet.png) |
| Projects | error state (tablet) | pass | [projects-error-tablet.png](screenshots/projects-error-tablet.png) |
| Setup | projects page offers setup (tablet) | pass | [dashboard-empty-tablet.png](screenshots/dashboard-empty-tablet.png) |
| LLM providers | provider picker (tablet) | pass | [providers-tablet.png](screenshots/providers-tablet.png) |
| GitHub | token shorter than 8 characters cannot list repos (tablet) | pass | [github-short-token-tablet.png](screenshots/github-short-token-tablet.png) |
| GitHub | stub repo is listed (tablet) | pass | [github-repos-tablet.png](screenshots/github-repos-tablet.png) |
| Knowledge map | setup shows the map (tablet) | pass | [knowledge-tablet.png](screenshots/knowledge-tablet.png) |
| Company | generation finishes and offers the org chart (tablet) | pass | [company-ready-tablet.png](screenshots/company-ready-tablet.png) |
| Org chart | chart, documentation, and PR coordinator are visible (tablet) | pass | [org-chart-tablet.png](screenshots/org-chart-tablet.png) docs=Sofia Rossi Documentation Lead OFF pr=Esme Laurent PR Merge Coordinator OFF |
| Org chart | edit instructions (tablet) | pass | [org-edit-tablet.png](screenshots/org-edit-tablet.png) |
| Org chart | toggle CEO off (tablet) | pass | [org-toggle-tablet.png](screenshots/org-toggle-tablet.png) |
| Org chart | toggle CEO back on (tablet) | pass | [org-toggle-on-tablet.png](screenshots/org-toggle-on-tablet.png) |
| Org chart | add an agent (tablet) | pass | [org-add-tablet.png](screenshots/org-add-tablet.png) |
| Org chart | delete asks for confirmation (tablet) | pass | [org-delete-confirm-tablet.png](screenshots/org-delete-confirm-tablet.png) |
| Org chart | confirmed delete removes the agent (tablet) | pass | [org-deleted-tablet.png](screenshots/org-deleted-tablet.png) |
| Flow ownership | owner select changes in the org chart (tablet) | pass | [flow-owner-tablet.png](screenshots/flow-owner-tablet.png) before=4413860e-de71-4efc-a993-66487a29644e |
| Model tiers | unknown model id shows an error (tablet) | pass | [tiers-invalid-tablet.png](screenshots/tiers-invalid-tablet.png) HTTP 422 Model not-a-real-model is not in the provider catalog from Test Connection |
| Model tiers | valid tier change is saved (tablet) | pass | [tiers-saved-tablet.png](screenshots/tiers-saved-tablet.png) |
| Projects | create from the projects page (tablet) | pass | [projects-created-tablet.png](screenshots/projects-created-tablet.png) |
| Projects | edit and delete controls on the projects page (tablet) | pass | [projects-edit-delete-tablet.png](screenshots/projects-edit-delete-tablet.png) rename=2 archive=2 |
| Logout | sign out returns to login (tablet) | pass | [logout-tablet.png](screenshots/logout-tablet.png) |
| Login | wrong password shows an error (tablet) | pass | [login-error-tablet.png](screenshots/login-error-tablet.png) |
| Login | valid password returns to projects (tablet) | pass | [login-ok-tablet.png](screenshots/login-ok-tablet.png) |
| Session | expired access token is refreshed from the cookie (tablet) | fixed | [session-expiry-tablet.png](screenshots/session-expiry-tablet.png) http://localhost:3000/projects |
| Landing | home page renders (mobile) | pass | [landing-mobile.png](screenshots/landing-mobile.png) |
| Signup | name shorter than 2 characters is rejected (mobile) | fixed | [signup-validation-mobile.png](screenshots/signup-validation-mobile.png) Name must be at least 2 characters |
| Signup | account lands on setup (mobile) | pass | [signup-dashboard-mobile.png](screenshots/signup-dashboard-mobile.png) |
| Projects | empty state (mobile) | pass | [projects-empty-mobile.png](screenshots/projects-empty-mobile.png) |
| Projects | loading state (mobile) | pass | [projects-loading-mobile.png](screenshots/projects-loading-mobile.png) |
| Projects | error state (mobile) | pass | [projects-error-mobile.png](screenshots/projects-error-mobile.png) |
| Setup | projects page offers setup (mobile) | pass | [dashboard-empty-mobile.png](screenshots/dashboard-empty-mobile.png) |
| LLM providers | provider picker (mobile) | pass | [providers-mobile.png](screenshots/providers-mobile.png) |
| GitHub | token shorter than 8 characters cannot list repos (mobile) | pass | [github-short-token-mobile.png](screenshots/github-short-token-mobile.png) |
| GitHub | stub repo is listed (mobile) | pass | [github-repos-mobile.png](screenshots/github-repos-mobile.png) |
| Knowledge map | setup shows the map (mobile) | pass | [knowledge-mobile.png](screenshots/knowledge-mobile.png) |
| Company | generation finishes and offers the org chart (mobile) | pass | [company-ready-mobile.png](screenshots/company-ready-mobile.png) |
| Org chart | chart, documentation, and PR coordinator are visible (mobile) | pass | [org-chart-mobile.png](screenshots/org-chart-mobile.png) docs=Nora Lindgren Documentation Lead OFF pr=Isaac Cohen PR Merge Coordinator OFF |
| Org chart | edit instructions (mobile) | pass | [org-edit-mobile.png](screenshots/org-edit-mobile.png) |
| Org chart | toggle CEO off (mobile) | pass | [org-toggle-mobile.png](screenshots/org-toggle-mobile.png) |
| Org chart | toggle CEO back on (mobile) | pass | [org-toggle-on-mobile.png](screenshots/org-toggle-on-mobile.png) |
| Org chart | add an agent (mobile) | pass | [org-add-mobile.png](screenshots/org-add-mobile.png) |
| Org chart | delete asks for confirmation (mobile) | pass | [org-delete-confirm-mobile.png](screenshots/org-delete-confirm-mobile.png) |
| Org chart | confirmed delete removes the agent (mobile) | pass | [org-deleted-mobile.png](screenshots/org-deleted-mobile.png) |
| Flow ownership | owner select changes in the org chart (mobile) | pass | [flow-owner-mobile.png](screenshots/flow-owner-mobile.png) before=4d161d26-36d3-4efd-bf35-19f7e39b3e43 |
| Model tiers | unknown model id shows an error (mobile) | pass | [tiers-invalid-mobile.png](screenshots/tiers-invalid-mobile.png) HTTP 422 Model not-a-real-model is not in the provider catalog from Test Connection |
| Model tiers | valid tier change is saved (mobile) | pass | [tiers-saved-mobile.png](screenshots/tiers-saved-mobile.png) |
| Projects | create from the projects page (mobile) | pass | [projects-created-mobile.png](screenshots/projects-created-mobile.png) |
| Projects | edit and delete controls on the projects page (mobile) | pass | [projects-edit-delete-mobile.png](screenshots/projects-edit-delete-mobile.png) rename=2 archive=2 |
| Logout | sign out returns to login (mobile) | pass | [logout-mobile.png](screenshots/logout-mobile.png) |
| Login | wrong password shows an error (mobile) | pass | [login-error-mobile.png](screenshots/login-error-mobile.png) |
| Login | valid password returns to projects (mobile) | pass | [login-ok-mobile.png](screenshots/login-ok-mobile.png) |
| Session | expired access token is refreshed from the cookie (mobile) | fixed | [session-expiry-mobile.png](screenshots/session-expiry-mobile.png) http://localhost:3000/projects |
