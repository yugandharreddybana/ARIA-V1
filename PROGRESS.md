# ARIA-V1 — Progress Log

> This is the session handoff file. READ at session start, UPDATE at session end.
> Pair with `MEMORY.md` (file index + decisions + anti-patterns) and `IMPLEMENTATION.md` (full 17-phase build plan).
> Where this file or `v27_9.md` / `IMPLEMENTATION.md` disagree with `docs/PRODUCT_SPEC.md`, the product spec wins.

---

## Milestone 3 — plan (this branch)

Branch: `cursor/m3-plan-b334`. Plan only: `docs/milestones/M3_PLAN.md` **rev 4** (no feature code). Base: main (#9+#11). Rev 4 re-review: DAG **A∥B → C → D∥E∥F** (E/F depend on C); reserved V21–V28; **`activity_kinds` / `runtime_kinds` FK** seeded in C/A so D/E/F never rewrite activity CHECK. Prior rev 3: idea_cards, red/blue lockdown, ownership, learning M3I, traceability.

## Milestone 2 — frontend (merged, PR #11)

Branch: `cursor/m2-frontend-e5e7` (merged). Plan §13 matches the simplified UI on main: primitives are Button, Input, Card, Badge, Dialog, EmptyState, PageHeader, and Table; Runs is `/runs`; the board is `/board`. `LogView` is the only added primitive.

Shipped: F1–F5 runs/budget/flow-owners/merge-guard/tiers UI; ticket timeline, story points, evidence downloads; board awaiting_merge/blocked; project rename/archive. Review fixes (socket payload shapes, project-scoped budget, catalog aliases) landed with the merge.

## Milestone 2 — agent runs backend (merged, PR #9)

Branch: `cursor/m2-backend-1c0c` (merged). Plan: `docs/milestones/M2_PLAN.md` (§17 is the ticket log, story points, and evidence). Product spec wins on conflict. Agents never merge.

### Pending owner confirmation

These are the plan §16 defaults, each a config setting, until the owner says otherwise:

- `ARIA_CURSOR_KEY_TYPE=user`
- `ARIA_MONTHLY_TOKEN_BUDGET=20000000` (tokens, not dollars)
- `ARIA_MERGE_GUARD_MODE=block`
- `ARIA_LOCAL_FALLBACK=off` (local worktree worker is not built)
- `ARIA_AWAITING_MERGE_COUNTS_ACTIVE=false`
- `ARIA_QA_BROWSER=false` and `ARIA_SECURITY_REVIEW=false`. Before/after screenshots are required in the evidence prompts. The visual-regression suite and the LLM security review stay M3.
- `ARIA_MAX_REVIEW_FIX_ROUNDS=2` and `ARIA_MAX_QA_FIX_ROUNDS=2`
- Schedule: `ARIA_WORKDAYS=1,2,3,4,5`, `ARIA_TIMEZONE=UTC`, workday `09:00`–`18:00`, risk ratio `0.8`

### What landed

- **B1.** Node 22 in engines, `.nvmrc`, Dockerfiles, and CI. `@cursor/sdk` `1.0.40`. Stub mode is refused in production.
- **B2.** Flyway V15 `agent_runs` and `agent_run_logs`. Drizzle matches. `TicketStatus` includes `awaiting_merge` and `blocked`. Drift check passes.
- **B3–B5.** Queue (`FOR UPDATE SKIP LOCKED`, 90s lease, 30s heartbeat, reaper), worker, redacted logs, runs API, monthly token buckets, agent OFF blocks queued runs and cancels running rows.
- **B6.** Provider stub covers Cursor agents, SSE, usage, cancel, GitHub PRs, reviews, checks, and branches. Merge endpoints return 418. Vitest global setup points the suite at the stub.
- **B7–B9.** Structured JSON with one retry. Cloud worker uses `bc-<run id>`, adopts a 409, and falls back to poll on 410. Local planning is a scrubbed child process. The live child calls `planWithCursorSdk` (`Agent.create`, plan mode, tool allowlist, empty `settingSources`). `ARIA_CURSOR_LOCAL_MODE=stub` stays the CI default and never imports the SDK. `resolveForRun` refreshes a catalog older than 24h, or an empty one, or a missing id, and blocks a missing agent pin with `MODEL_UNAVAILABLE`.
- **B10.** V16 `flow_owners`. Dropped `business_flows.owner_agent_id`, `business_flows.backup_agent_id`, and `skills.owned_flow_ids`. `skills.backup_agent_id` stays (the agent's own backup). JSON still returns `ownerAgentId` / `backupAgentId` from the join table.
- **B11–B12.** Knowledge-map and company runs enqueue. A validated AI roster (names, instructions, seat count, one CEO, acyclic managers) is applied with `company_source=ai`. Template fallback runs only after two failed validations, and the reason is logged. No LLM stays 201. Knowledge merge updates summary, tech stack, modules, APIs, data model, and flows. Unknown paths are dropped. Owner-edited flow layers stay. A schema-invalid plan leaves `source=template` and does not delete flows. A summary that omits a flow name still keeps that name.
- **B13–B15.** Merge tripwire, COMMENT-only reviews, diff guards, develop / review / fix, round caps.
- **B16.** QA stores a report and will not move a ticket to `awaiting_merge` without valid dev and QA evidence. `prWatcher` polls every 60s with `If-None-Match`. An owner merge moves the ticket to `done` and cancels queued runs. A closed or abandoned pull (closed, no `merged_at`) moves it to `rejected`. Both write a `status_change` ticket event.
- **B17.** Config only. `REPO_ACCESS` blocks the run.
- **B19.** V17 `ticket_events`, hash chain, timeline, Markdown/JSON export, agent append limited to tickets the agent is on.
- **B20.** V18 story points (Fibonacci, default 1). `due_at` from working days. At-risk at 80% and overdue past `due_at`, each logged once. `GET /api/projects/:id/schedule`. Points above 8 set `splitSuggested`. Omitted points come from the planning agent when a workspace model is configured. The length heuristic is the fallback, including when the planner returns non-JSON. The event records `source` as `owner`, `planner`, or `heuristic`. `budget:warn` fires at 80% of the project limit.
- **B21.** Dev and QA Markdown plus pdfkit PDFs in `ticket_reports`. Prompt templates require the sections. Gate sends invalid evidence back as a fix round. Content hash is an `evidence` event. Report links go on the PR comment. Downloads are workspace-scoped.

### Review fix pass (PR #9, do not merge from the agent)

Opus review items 1–23 and the re-review (8 remaining must-fixes, near-blocking, and should-fix) are addressed on `cursor/m2-backend-1c0c`. Not merged.

- Cloud worker uses the workspace encrypted key, `repos[{url,startingRef,prUrl}]`, `{agent,run}`, SSE `event:` lines, `git.branches[].sha`, `GET /v1/agents/{id}/usage?runId=` `totalTokens`, and a timeout on every call. A usage `403 feature_unavailable` falls back to the estimate cap. A bad `Last-Event-ID` reconnects once, then polls. QA and fix runs attach the known pull request URL when the cloud reply omits it.
- `Dockerfile.middleware` and `Dockerfile.web` copy `pnpm-workspace.yaml` and install with the lockfile. The runtime image has `git` and `HOST=0.0.0.0`. `@aria/db`, `@aria/shared`, and `@aria/config` compile to `dist` and export that JavaScript for Node, so `node dist/index.js` can load them. CI job `docker-images` builds the three images, runs the planner-child smoke, then starts postgres, redis, backend, middleware, and web with compose and checks `/api/health`.
- Planning checks the repo out with async `git` (askpass token only on the git process, an in-process lock plus a lock file, unique worktree, timeouts) and strips `.cursor/{hooks,mcp,environment}.json`. The worktree is removed when the run finishes, fails, or times out. Tools `none` skip the checkout. A JSON-fix retry reuses the same worktree. `sandboxOptions` sits under `local`. The planner child exits after it replies and the parent kills the process group.
- QA polls checks until they complete or `ARIA_QA_CHECK_TIMEOUT_MS` (default 30 minutes). Pending is not an immediate failure. Evidence accepts a QA report at the QA head and a dev report at that head or at the succeeded develop/fix commit QA built on. The stub changes the pull head SHA on every push.
- Review line comments stay on diff hunks. Pull files page past 30. One project budget bucket is shared by planning and coding. Reservations are released on cancel, human status change, agent disable, and worker early return.
- Ticket-event deletes are allowed only while a parent `BEFORE DELETE` trigger is on the stack and the client query is a top-level `DELETE FROM` workspaces, projects, or tickets. A temporary-table trigger does not match. The table owner can still `DISABLE TRIGGER`; these migrations do not `CREATE ROLE`. `aria_purge_ticket_events*` is `SECURITY DEFINER` and rejects a direct call. A session GUC is not consulted. Deleting a workspace that still has events succeeds.
- A usage `403` estimates prompt, assistant, thinking, and tool-call text (`ceil(chars/4)`), and a stub `estimatedTokens` still replaces that total. V20 stores `budget_project_scoped` on the run so a later budget change releases the same ledger row. JSON-fix retries add their token usage. `.github/workflows/shadow-learning.yml` is valid YAML, uses Node 22, and a push runs a green no-op job instead of opening a pull request.
- Drift check compares column types and unique indexes. Drizzle timestamps that mirror `TIMESTAMPTZ` set `withTimezone: true`.

### Verified locally on 2026-10-25

- `node scripts/check-schema-drift.cjs` passed.
- `pnpm -F @aria/middleware exec tsc --noEmit` passed.
- `pnpm -F @aria/middleware exec eslint src --ext .ts --max-warnings 0` passed.
- `pnpm -F @aria/middleware test` — 24 files, 135 tests passed, including an empty worktrees directory after checkout and after a failed local run, the temporary-table delete rejection, a budget release after `token_budget_monthly` is cleared, and `ANTHROPIC_ENABLED=false` staying off.
- `node` resolves `@aria/db` and `@aria/shared` to `packages/*/dist/index.js` and loads them.
- V19's purge functions and V20's `budget_project_scoped` column were applied to the local database with `psql`. Flyway was not repaired. A fresh CI database applies the edited files from scratch.
- Docker is not installed in this environment. The image boot and compose health check are the `docker-images` CI job.
- Java sources were not changed. Java CI remains the check.

### Open

- `repoMirror` and `localWorktreeWorker` are not in this PR. `ARIA_LOCAL_FALLBACK` stays off.
- Screenshot capture is a prompt requirement plus a stub PNG. Middleware does not run Playwright. `ARIA_QA_BROWSER` stays false. The visual-regression suite stays M3.
- `smoke:cursor` has not been run against a real key. No scratch-repo ticket has gone through a live develop → owner merge. The SDK import is wired; CI still uses the stub.

Non-goals that stay M3 or later: standup ceremony, merge-order coordinator, red/blue execution, ideas and proposals, the learning agent, the visual-regression suite, LLM security review, worker sub-agents, multi-tenant, GitHub webhooks. Frontend F1–F5, including the timeline UI, are still not in this PR. The simplified web shell from PR #8 is on main.

## UI simplification (merged, PR #8)

Branch: `cursor/simplify-web-ui-d456`, merged to main. UI in `apps/web`, plus the Playwright suite. Middleware only forwards the bearer token to the concept graph and proxies orchestrator session create. No schema changes.

- Light theme by default, optional dark mode (`aria-theme` on `<html>`), one accent, system font, shared primitives (Button, Input, Card, Badge, Dialog, EmptyState, PageHeader, Table).
- Sidebar is Projects, Company, Board, Runs, Settings. `/dashboard` redirects to `/projects`. `/sessions` redirects to `/runs`. `/board` renders the ticket board. Signup goes to `/setup`.
- Setup is one stepper (project, model, GitHub, knowledge, company). The org chart uses custom nodes (name, role, ON/OFF) and a side panel. `components/runs/agent-runs.tsx` is an empty Queue slot for Milestone 2.
- A project page still opens when the Java analysis service is down. The jobs section shows that error.
- Dialogs are positioned with `dvw`/`dvh` so the panel stays inside the visible viewport on mobile.
- No Playwright spec was deleted. `dashboard.spec.ts` now checks that `/dashboard` opens the projects home (the stat-card dashboard is gone). `apps/e2e/src/agent-kanban.spec.ts` moved to `apps/e2e/tests/agent-kanban.spec.ts` because the board still exists. Sprint 5+ specs were updated for the new labels, the orchestrator create proxy, and graph coverage 404s.
- Concept graph screenshots were retaken with the Java backend up (Docker Compose, host network, existing Postgres). The map is empty (0 concept nodes). The knowledge map shows the Demo Shop flows.
- Verified on that branch: `pnpm -F @aria/web exec tsc --noEmit`, `pnpm -F @aria/web lint`, `pnpm -F @aria/middleware exec tsc --noEmit`, anti-slop 10/10. Full Playwright suite (`--workers=1 --retries=0`): **510 passed** (170 on chromium-desktop, 170 on chromium-tablet, 170 on chromium-mobile) in 7.4m.

## Milestone 1 — foundation (merged, PR #5)

Branch: `cursor/milestone-1-foundation-db70`. PR #5. Product spec: `docs/PRODUCT_SPEC.md`.

Shipped, including the review-fix pass:
- Email signup works without GitHub OAuth. Repo access is a personal access token, encrypted at rest.
- Setup UI resumes a half-finished setup, polls analysis until the map exists or a job fails, and does not send a custom base URL for Cursor, Gemini, Groq, OpenAI, or Anthropic.
- Secrets use scrypt + AES-256-GCM. New rows are `gcm:v2` with a key id and AAD (workspace id + column). Older `scrypt:v1` and legacy rows still decrypt. The example placeholder key is rejected.
- Knowledge map reads root and workspace manifests first, ignores tests and docs for flows, treats only the root `app/page.tsx` as the homepage, and detects data entities from `CREATE TABLE`, `model X {`, `pgTable(`, and `@Entity`. A unit test runs the builder against this repo's real tree.
- One knowledge map per project. Re-analysis upserts flows on `(project_id, flow_key)` and keeps owners. Multiple repos merge. A repo with a queued or running job is not queued again. Jobs stuck `running` for 10 minutes go back to `queued`.
- Company regeneration and agent delete run in a transaction. Regeneration returns 409 while sessions or tickets exist unless `force` is set. Deleting an owner promotes the backup. A manager, backup, or flow owner must belong to the same project.
- Documentation and PR-coordinator agents are always created. They are OFF when the seat count does not already include them. Size is the count of ON seats.
- Org chart: errors surface, delete asks for confirmation, add picks a role and a manager, and owner / backup / manager can be reassigned.
- Model tiers: planning defaults to `top`, development to `auto`. Test Connection lists the provider's models, stores both tier ids, and later edits must be in that catalog. `auto` is sent as `{ id: 'auto' }`. `auto-smart` is used only when that id was stored. Completions still go through one token-gateway singleton whose ledger is in Postgres.
- Mock mode is `ARIA_LLM_MODE=mock` or `ARIA_GITHUB_MODE=mock`, and only when `NODE_ENV` is not production. Live tests and CI e2e use `scripts/provider-stub.mjs`.
- Legacy unvalidated skill creation (`POST /api/projects/:id/skills` and onboarding commit) returns 410.
- Java `@AuthenticationPrincipal` resolves `AriaAuthentication`. Analysis, graph, distillation, incidents, migrations, and fleet writes are scoped to the caller's workspace.
- Flyway V14. Drizzle matches the named text columns, nullable `skills.project_id`, and `UNIQUE(project_id, flow_key)`. `drizzle-kit` generate/migrate scripts are removed. CI runs `scripts/check-schema-drift.cjs`. Middleware listens on `127.0.0.1` unless `HOST` is set (Compose sets `0.0.0.0`).
- CI e2e runs the milestone spec, the landing spec, and sprint 1–4 specs on desktop, tablet, and mobile.

Verified locally on 2026-10-25 (Postgres 16 + pgvector and Redis on the host; Docker is not installed here):
- `node scripts/apply-migrations.cjs` applied V14. `node scripts/check-schema-drift.cjs` passed.
- `pnpm -F @aria/middleware exec tsc --noEmit` and `pnpm -F @aria/web exec tsc --noEmit` passed.
- `pnpm -F @aria/middleware exec eslint src --ext .ts` passed.
- `pnpm -F @aria/web lint` passed with one existing warning in `src/components/ui/select.tsx`.
- `pnpm -F @aria/middleware exec vitest run` — 21 files, 94 tests passed.
- `mvn -B -ntp -f apps/backend/pom.xml test` — exit 0 (1 skipped: `AriaBackendApplicationTests`).
- `mvn -B -ntp -f apps/backend/pom.xml -DskipTests spring-boot:run` validated 14 Flyway migrations, started, and `GET /actuator/health` returned `{"status":"UP"}`.
- Playwright, live mode against the stub, `BASE_URL=http://localhost:3000`, workers 1, retries 0: milestone + landing + sprint 1–4 on chromium-desktop, chromium-tablet, and chromium-mobile — **213 passed (3.7m)**.

Decisions the owner needs:
- Cursor still has no chat-completions API. Test Connection stores ids from `GET /v1/models`. Completions throw `CURSOR_NO_CHAT_API` after the queue selects the model. Agent runs are Milestone 2 (see the section above). Details: `docs/CURSOR_PROVIDER.md`.
- Company size counts ON seats, including leadership. Documentation and the PR coordinator are extra OFF agents when they do not fit.
- Company generation still dispatches one `company_generation` call. Cursor refuses it. The template org is what you edit.
- `POST /api/projects/:id/teams` is still the older unvalidated team route. The review asked to disable the unvalidated skill-creation paths, and those return 410.
- Duplicate legacy columns (`tickets.assigned_to`, `skills.model`, and similar) stay so Hibernate validate keeps working.

Out of scope: Cursor agent runs, agents writing code or PRs, merge order, ceremonies, red/blue execution, learning.

## 🔄 Later

**Sprint 11 — Phase 6: IDE / LSP Integration**  *(not this milestone)*
- Spec anchors: §18M (Deep Native IDE/LSP Integration).
- DoD checklist: see IMPLEMENTATION.md §8.

---

## ✅ Completed Sprints

### Sprint 10 — Phase 5: Fleet & Speculation  *(code-complete, unverified — NO-RUN MODE)*
**Branch**: `claude/aria-implementation-plan-4GHZI` | **Spec**: §17.4 + §18I + §8

What was built:
- **Flyway V10** — `agent_registry` (Ed25519 pubkey + fingerprint), `fleet_outcomes` (signed
  envelope log), `agent_heartbeats`, `contract_debts`, `shadow_branches`, `fleet_circuit_breakers`.
- **Java `com.aria.fleet`**:
  - `model/*` — `AgentRegistration`, `FleetOutcome`, `AgentHeartbeat`, `ContractDebt`,
    `FleetCircuitBreaker`.
  - `repository/*` — 5 Spring Data JPA repositories with a native `latestPerAgentSince()` query.
  - `service/AgentRegistryService` — generates Ed25519 keypair on register (per ADR-0014),
    stores SPKI pubkey + SHA-256 fingerprint, returns PKCS8 private key once.
  - `service/FleetEnvelopeSigner` — Ed25519 sign + verify over the canonical input
    `epicId|topic|payload|agentId`.
  - `service/FleetCommanderService` — verifies envelope signature, persists `fleet_outcomes`,
    enforces `CANONICAL_TOPICS` (advisory log, not hard-fail).
  - `service/HealingGuardrailService` — DFS over the heartbeat wait-graph; pure-function
    `detectCycles()` exposed for testing; persists `fleet_circuit_breakers` per detected cycle.
  - `service/DeadlockBreakerService` — sweeps every 2-min heartbeat window; agents waiting
    ≥ 3 min (ADR-0015) trigger a forced V1 contract via `ContractDebt`. LLM-driven prompt
    deferred to Sprint 17.
  - `service/ShadowBranchService` — opens `aria-shadow/<ticket>` rows with deterministic
    branch names; revert helper for ticket re-prioritisation.
  - `dto/FleetDtos` + `controller/FleetController` — `/api/fleet/{agents,events,heartbeats,
    heal/scan,deadlock/sweep,shadow,debts,breakers}`.
- **Middleware proxy** — `services/fleet.proxy.ts` + Zod-strict schemas + controller + routes
  mounted at `/api/fleet` (auth + per-endpoint rate limit). Heartbeats get a 600/min cap so
  many agents can beat without hitting the global rate limiter.
- **`apps/middleware/src/app.ts` rebuilt** with the full route list (telemetry middleware +
  `/metrics` + `/api/incidents` + `/api/fleet` — previous incremental Edits had silently lost
  the Sprint 9 mounts).
- **Tests** (authored, NOT executed — NO-RUN MODE):
  - Java JUnit / Mockito: `FleetEnvelopeSignerTest` (4 cases — round-trip, tampered payload,
    unknown agent, tampered topic), `HealingGuardrailServiceTest` (4 cases — 2-cycle, 3-cycle,
    acyclic chain, disconnected components), `AgentRegistryServiceTest` (3 cases — keygen,
    duplicate reject, end-to-end sign-then-verify round-trip).
  - Middleware Vitest: `fleet.test.ts` (5 schema cases).
  - Playwright: `sprint10-fleet.spec.ts` (3), `sprint10-deadlock.spec.ts` (2).
- **ADRs**: 0014 Fleet envelope format + signing, 0015 Deadlock Breaker timeout + producer
  election.

Known state (NO-RUN MODE):
- All code mentally typechecked; no `pnpm` / `mvn` / `tsx` / `node` / `playwright` executed.
- Pre-Cog speculative execution: the `aria-shadow/*` row infrastructure ships in Sprint 10;
  the actual git operations + Jira webhook listener wire in Sprint 14 alongside the Chaos
  Sandbox.
- Healing scan + deadlock sweep are explicit POST endpoints in Sprint 10; Sprint 14 adds a
  cron (`@Scheduled`) to run them every 30 s and 60 s respectively.

---

### Sprint 9 (gap-fill) — close all 7 §6 DoD audit gaps  *(NO-RUN MODE)*
**Branch**: `claude/aria-implementation-plan-4GHZI` | **Commit**: `466bb48`

Self-audit caught seven Sprint 9 §6 gaps; all closed in `466bb48`:

1. **Redis `system.alerts` consumer** — `apps/middleware/src/services/systemAlerts.consumer.ts`
   subscribes via `XREADGROUP`, forwards payloads to `POST /api/incidents` with the internal
   service token. Started in `index.ts`, stopped on `SIGTERM` / `SIGINT`.
2. **Auto-Precision session on P0/P1** — `IncidentResponder` orchestrates the escalation path;
   `IncidentController.declare()` returns `{ incident, escalation }` in one response.
3. **Concept Graph correlation** — `SemanticCorrelator` ranks `semantic_chunks` against incident
   text (ADR-0010 weights) and returns top-N file paths.
4. **Jira MCP stub** — `JiraMcpStub.createIncidentTicket()` logs deterministic `ARIA-<sha8>` keys.
5. **Semantic Tripwire generator** — `SemanticTripwire` entity + repo + service with
   `install(table, column)` and `checkAccess(value, ctx)` that auto-declares P1 incidents on
   first hit.
6. **SLO file → DB sync** — `SloDefinition` entity + `SloBootstrap @PostConstruct` reads
   `.entiresystem/slos.yml` and upserts `slo_definitions`.
7. **Observability profile** — `otel-collector`, `tempo`, `prometheus`, `grafana` services added
   under `--profile observability`. Config files at `infra/{prometheus.yml,otel-collector.yaml,tempo.yaml}`.

New tests (authored, NOT executed — NO-RUN MODE): `SemanticTripwireServiceTest` (3),
`IncidentResponderTest` (3), `SloBootstrapTest` (2).

---

### Sprint 9 — Phase 4: Telemetry & Incidents  *(code-complete, unverified — NO-RUN MODE)*
**Branch**: `claude/aria-implementation-plan-4GHZI` | **Commit**: `69adb98` | **Spec**: §17

What was built:
- **`.entiresystem/slos.yml`** — canonical SLO catalogue (ADR-0011).
- **Flyway V9** — `slo_definitions`, `slo_breaches`, `incidents`, `migration_playbooks`,
  `migration_phase_runs`, `semantic_tripwires`.
- **Java `com.aria.incident`** — `Incident` JPA entity, `IncidentCommanderService` (state machine
  with explicit valid transitions), `IncidentController` (`/api/incidents`).
- **Java `com.aria.migration`** — `MigrationPlaybook` + `MigrationPhaseRun` entities,
  `MigrationOrchestratorService` (dep-free YAML parser, signed-hash registration, sequential
  runner that **NEVER auto-rolls back** `stateful_dangerous` or `irreversible` phases per
  ADR-0012), `MigrationController`.
- **Java `com.aria.telemetry`** — `PrometheusMetrics` registry + `MetricsController` (`/metrics`).
- **Middleware telemetry** — counter / gauge / histogram registry, request middleware,
  `/metrics` route, `/api/incidents` proxy (auth + Zod).
- **Web `/(dashboard)/system-health`** — Token Gateway queue card + recent incidents list with
  severity badges.
- 13 unrun tests (9 Java JUnit, 4 Vitest, 4 Playwright).
- ADRs **0011** (SLO catalogue + breach severity), **0012** (Migration playbook + rollback rules),
  **0013** (Tripwire isolation rules).

---

### Sprint 8 — Phase 3: Advanced Retrieval (Concept Graph + Distillation)  *(code-complete, unverified — NO-RUN MODE)*
**Branch**: `claude/aria-implementation-plan-4GHZI` | **Spec**: §6, §18N, §7

What was built:
- **Java `com.aria.graph`** package: `SemanticChunk` JPA entity, `ChunkType` + `GraphLevel` enums,
  `SemanticChunkRepository` (with native HNSW query for nearest neighbours + native UPDATE for
  pgvector writes), `SemanticChunker` (regex-based per ADR-0009 — TS/JS/Java/Python/SQL/Markdown,
  whole-file fallback for unknown languages), `EmbeddingClient` (routes through the middleware
  Token Gateway — no direct provider calls), `ConceptGraphBuilder` (idempotent per `version_hash`,
  upserts Level-1 chunks + summary + embedding), `DistillationEngine` (intent extraction → ranking
  per ADR-0010 → bucketed payload with `rawTokens / totalTokens / compressionRatio` accounting).
- **REST contracts** (`com.aria.graph.controller.DistillationController`):
  `POST /api/distill`, `POST /api/graph/rebuild`, `GET /api/graph/coverage/{projectId}`.
- **Middleware proxy** (`apps/middleware/src/services/distill.service.ts`):
  `distill()` forwards to the Java engine and merges in `experienceNotes` + `antiPatterns` from
  `ExperienceService` (top-3 per veracity rank), `preFlight()` computes a running compression-ratio
  estimate (20-sample moving average per `(project, agent)`) over `distillation_runs`. Both wired
  to `/api/distill` and `/api/distill/preflight` (auth, Zod-strict, rate-limited).
- **Flyway V8** — `semantic_chunks` (768-dim pgvector + HNSW index), `distillation_runs` audit log,
  `concept_graph_coverage` materialised view, deferred HNSW index on `concept_nodes.embedding`.
- **Web dashboard graph page** — added a 4-level switcher (`graph-level-{1..4}`) for Symbol /
  Module / Domain / Decision filtering.
- **CLIs** — `scripts/knowledge-review.ts` (read-only coverage report) wired as `pnpm knowledge-review`.
- **Tests** (authored, NOT executed — NO-RUN MODE):
  - Java JUnit: 5 `SemanticChunkerTest` cases + 5 `DistillationEngineTest` cases.
  - Middleware Vitest: 5 `distill.test.ts` cases (schemas + preflight fallback).
  - Playwright: `sprint8-distillation.spec.ts` (4 cases), `sprint8-graph-levels.spec.ts` (1 case).
- **ADRs**: 0009 SemanticChunker strategy, 0010 Distillation ranking weights + 5× target.

Known state (NO-RUN MODE):
- All code mentally typechecked; no `pnpm`/`mvn`/`tsx`/`node`/`playwright` executed this session.
- The Java side still needs `Jdbc` config on Sprint 14 (Testcontainers) before the integration
  test can boot a real Postgres.
- EmbeddingClient currently calls `/api/llm/invoke` with a placeholder `embeddingOnly: true`
  flag; the Token Gateway already routes to Ollama, but the embedding-vs-chat dispatch path will
  be tightened in Sprint 9 (telemetry will expose the timing per call).

---

### Sprint 7 — Phase 2: Experience & Memory  *(code-complete, unverified — NO-RUN MODE)*
**Branch**: `claude/aria-implementation-plan-4GHZI` | **Spec**: §2.2, §6, §9

What was built:
- **Canonical `.entiresystem/` layout** locked down per ADR-0007: CORE_VALUES, DESIGN, DOMAIN_BOUNDARIES,
  SKILL.md (top-level index), EXPERIENCE/, ANTI_PATTERNS/, skills/ subtree, ADRs/, ui_discovery/ stubs for
  Sprint 8+ subtrees.
- **EXPERIENCE.md** — cross-cutting lessons file + 3 per-persona files (`frontend-web`, `backend-api`,
  `security`). Every entry tagged with a Knowledge Veracity tag.
- **ANTI_PATTERNS** — `auth`, `database`, `ux` domain catalogues.
- **Per-skill SKILL.md + experience.yml** for **12 personas**: backend-api-specialist,
  frontend-web-specialist, db-specialist, devops-engineer, qa-e2e, security-engineer,
  compliance-auditor, finops-oracle, historian, ux-defender, integration-engineer,
  knowledge-graph-architect. Each SKILL.md carries the V27.9 §9 frontmatter + Transparency Card.
- **`.entiresystem/README.md`** — full layout reference + per-directory rules.
- **`ExperienceService`** (`apps/middleware/src/services/experience.service.ts`) — dep-free YAML
  reader/writer for skill experience profiles. Idempotent `append*` helpers; `incrementTicketsTouched`;
  `listSkills`; `read`.
- **`VeracityService`** (`apps/middleware/src/services/veracity.service.ts`) — ADR-0008 scoring
  (`weight × 0.5^(age/half_life)`), `rank`, `auditSkill` with stale-entry thresholds.
- **`ModelTransferService`** (`apps/middleware/src/services/modelTransfer.service.ts`) — `/model-transfer`
  zero-token tool that writes `.backend/<workspace>/{file_index.json, skill_headers.json, experience.json,
  prompts/*.md}`. **No LLM, no network**.
- **Routes** (`/api/experience`): `GET /`, `GET /:slug`, `GET /:slug/audit`, `POST /entries`,
  `POST /failure-stories`, `POST /model-transfer`. All authenticated + Zod-strict.
- **Scripts**: `scripts/knowledge-audit.ts` + `scripts/model-transfer.ts` CLIs, wired into root
  `package.json` as `pnpm knowledge-audit`, `pnpm model-transfer`, `pnpm anti-slop`,
  `pnpm anti-test-dodging`.
- **Shadow Learning** (`.github/workflows/shadow-learning.yml`) — on PR merge, extracts a draft entry
  (heuristic only — Sprint 17 wires the real Ollama call through the Token Gateway) and opens a
  follow-up PR tagged `veracity: ai-only`.
- **Flyway V7** (`packages/db/flyway/migrations/V7__sprint7_experience_memory.sql`) —
  `skill_experience_profiles`, `knowledge_veracity_audits`, `shadow_learning_runs`, `backend_workspaces`.
- **Tests** (NOT executed — NO-RUN MODE): 6 ExperienceService Vitest cases, 5 Veracity cases, 4
  ModelTransfer cases (15 new middleware tests); 2 new Playwright specs
  (`sprint7-experience.spec.ts`, `sprint7-model-transfer.spec.ts`).
- **ADRs**: 0007 `.entiresystem/` canonical layout; 0008 Knowledge Veracity scoring.
- **CLAUDE.md**: §5 extended with **5a. NO-RUN MODE** rule so future sessions know how to honour the
  "do not run any code" directive.

Known state (NO-RUN MODE):
- All code mentally typechecked but no `pnpm test` / `pnpm typecheck` / `mvn test` were executed this
  session. Sprint promoted to `code-complete (unverified)` per CLAUDE.md §5a. First post-NO-RUN session
  should run the full verification matrix (middleware typecheck + test + build, Java test, web typecheck)
  before opening the next sprint.
- Sanitizer / FIM / Token Gateway from Sprints 5+6 still pass; Sprint 7 work does not touch them.
- Shadow Learning is heuristic-only — no LLM call until Sprint 17 wires the Token Gateway through.

---

### Sprint 6 — Phase 1: Safety & Quality
**Branch**: `claude/aria-implementation-plan-4GHZI` | **Spec**: §12, §13, §14

What was built:
- **Sanitizer** (`apps/middleware/src/services/sanitizer.service.ts`) — two-stage detector (structural strip
  + 11 weighted heuristics), thresholds `<0.70 cleared` / `0.70–0.89 quarantined` / `≥0.90 rejected`,
  defensive auto-reject after `>20 quarantines / 60 min`. Optional `OllamaScorer` blends 50/50 with the
  heuristic. Pure heuristic mode works without a live Ollama.
- **File Integrity Monitor** (`apps/middleware/src/services/fim.service.ts`) — Ed25519-signed registry over
  `SKILL.md`, `DESIGN.md`, `DOMAIN_BOUNDARIES.json`, `CORE_VALUES.yml`. Detects `ok`, `missing`, `untracked`,
  `modified`, `invalid_signature`. Private key auto-generated at `.aria/keys/daemon.ed25519` (gitignored);
  public key committed to `.entiresystem/keys/daemon.pub`; signed registry committed to
  `.entiresystem/fim_registry.json`.
- **Plagiarism / IP scanner** (`apps/middleware/src/services/plagiarism.service.ts`) — SPDX + 5-gram
  fingerprint scan. Copyleft trips Legal Kill-Switch; permissive requires attribution; corpus matches above
  15% similarity flag for review.
- **Red Team probe generator** (`apps/middleware/src/services/redTeam.service.ts`) — deterministic seeded
  LCG produces SQLi/XSS/CSRF/IDOR/mass-assign probes per changed route. Critical/high block merge.
- **Anti-Slop Gate** (`apps/middleware/src/services/antiSlop.service.ts` + `tools/anti-slop-gate.ts`) —
  5-axis rubric (Philosophy/Hierarchy/Execution/Specificity/Restraint). P0 violations hard-fail; total
  score < 6 fails.
- **Anti-Test-Dodging linter** (`tools/anti-test-dodging.ts`) — rejects tests with zero `expect()`, trivial
  `expect(true).toBe(true)`-style assertions, or `it.skip` / `it.todo` / `xit(` / `xdescribe(`.
- **Turn-1 Discovery Form** — `POST/GET /api/ui-discovery`, persisted to Postgres + mirrored to
  `.entiresystem/ui_discovery/<ticket-id>.yml`. New page at `/(dashboard)/ui-discovery/[ticket]`.
- **Playwright config** — device matrix added: `chromium-desktop` (1920×1080), `chromium-tablet`
  (768×1024), `chromium-mobile` (375×667). Every spec runs on all three projects.
- **Flyway V6** — `quarantine_events`, `fim_registry`, `fim_alerts`, `red_team_findings`,
  `ui_discovery_forms` tables.
- **CI workflow** (`.github/workflows/ci.yml`) — jobs: typecheck, unit-tests, java-tests, anti-test-dodging,
  anti-slop, e2e matrix (desktop/tablet/mobile).
- **`.entiresystem/` brain files** stubbed and signed: CORE_VALUES.yml, DESIGN.md (read-only marker),
  DOMAIN_BOUNDARIES.json, SKILL.md.
- 3 new ADRs: 0004 sanitizer thresholds, 0005 Anti-Slop axes, 0006 FIM signing key custody.
- Fixed a pre-existing `.gitignore` bug that excluded `.entiresystem/` entirely — Sprint 5 ADRs were never
  actually pushed. Now `.aria/` (daemon-private runtime) is gitignored and `.entiresystem/` (canonical
  knowledge store) is committed.

Tests:
- Middleware Vitest 29/29 green (5 sanitizer + 5 FIM + 4 plagiarism + 5 redTeam + 3 antiSlop + 7 tokenGateway).
- Java JUnit 5/5 green (1 `@Disabled` until Sprint 14 Testcontainers).
- Web typecheck green.
- 5 new Playwright specs: `sprint6-{sanitizer,fim,redteam,plagiarism,ui-discovery}.spec.ts`.

Known state:
- Sanitizer / FIM are wired as services; binding them to specific ingress points
  (Token Gateway sanitization, FIM watcher on commit) is Sprint 7 + 9 work.
- Red Team runner is offline — chaos sandbox + Blue Team correlation lands Sprint 14.

---

### Sprint 5 — Phase 0 closeout: Token Gateway + Orchestrator + WebSocket + Infra
**Branch**: `claude/aria-implementation-plan-4GHZI` | **Spec**: §2.1, §2.2, §4, §6, §18F, §18H

What was built:
- `docker-compose.yml` + `Dockerfile.{web,middleware,backend}` — Postgres 16 + pgvector, Redis 7, Ollama (with init container pulling `qwen2.5-coder:7b` + `nomic-embed-text`), middleware, backend, web. Healthchecks + named volumes.
- `scripts/dev-up.sh`, `dev-down.sh`, `db-migrate.sh` — full local bring-up + Flyway via Docker.
- Flyway `V5__sprint5_token_gateway.sql` — enables pgvector, extends `sessions` with Orchestrator fields (mode/environment/mission_type/token_budget/user_id) + CHECK constraints, reserves `embedding vector(768)` on `concept_nodes`, creates `replay_frames` and `token_ledger`.
- **Token Gateway** (`apps/middleware/src/services/tokenGateway.service.ts`) — 5-priority queue, rolling 60s window, backpressure at MAX_QUEUE_DEPTH, dependency-inverted ports for testing, ReplayFrame on every dispatch, budget enforcement (warn 80% / hard-stop 95%), event emitter for WS bridge.
- Routing dispatcher with `OllamaDispatcher` (live) + `AnthropicDispatcher` (gated by `ANTHROPIC_ENABLED`).
- Postgres-backed `PgReplayFrameRepository` + `PgTokenLedgerRepository`; in-memory variants for tests.
- Middleware routes: `POST /api/llm/invoke`, `GET /api/llm/queue/status` (rate-limited + JWT-authed), `POST/GET /api/orchestrator/sessions/:id/{start|pause|stop|status}` (proxies to Java backend).
- **WebSocket hub** (`apps/middleware/src/ws/index.ts`) — socket.io on `/ws`, RS256 JWT handshake auth, rooms `session.<id>` / `agent.<id>` / `system.health`, bridges Token Gateway `token.warn` / `token.hard_stop` / `queue.depth`.
- Middleware refactored to a `createApp(env)` factory; `index.ts` attaches the HTTP server + socket.io and handles graceful shutdown.
- **Java Orchestrator** (`com.aria.orchestrator.*`) — `Session` JPA entity, `SessionState` / `SessionMode` / `Environment` / `MissionType` enums, `SessionRepository`, `OrchestratorService` with full state machine + IDOR ownership checks, `OrchestratorController` REST surface, DTOs.
- Spring `SecurityConfig` consolidated (removed dead duplicate); CORS + `/api/orchestrator/**` authn. `application.yml` flips Flyway on, points to bundled `db/migration`, sets `stringtype=unspecified` for String↔UUID interop.
- Web: `apps/web/src/hooks/useAriaSocket.ts` (auto-reconnect, typed events) + `SessionStatus` sidebar indicator wired into dashboard layout; new `Select` primitive added.
- Tests: 7 Vitest tests for the Token Gateway (queue order, backpressure, budget, IDOR, dispatcher-fail reservation release), 5 JUnit/Mockito tests for the Orchestrator state machine. 3 new Playwright E2E specs (`sprint5-token-gateway`, `sprint5-orchestrator`, `sprint5-websocket`).
- 3 new ADRs under `.entiresystem/ADRs/` (pgvector, socket.io, Token Gateway location).
- Schema fixes that unblock the build for everyone:
  - `packages/db/src/schema/*` — replaced non-existent `timestamptz` import with `timestamp(..., { withTimezone: true })`.
  - `apps/middleware/src/routes/health.routes.ts` — added default export.
  - `apps/middleware/tsconfig.json` — disabled portability-blocking `.d.ts` emission.
  - `apps/backend` — removed duplicate `SecurityConfig` and dead `JwtAuthFilter`; switched filter to `Jwts.parser().verifyWith(...)`.
  - `apps/web/src/components/ui/select.tsx` — added the missing shadcn `Select` API used by Sprints 4 pages.

Known state:
- `pnpm -F @aria/middleware typecheck` / `test` / `build` — green.
- `mvn test` — green (5 orchestrator tests pass; full-context `AriaBackendApplicationTests` `@Disabled` until Sprint 14 wires Testcontainers).
- `pnpm -F @aria/web exec tsc --noEmit` — green.
- Playwright E2E specs are committed; running them locally requires `pnpm dev:up` (docker-compose + Ollama models).

---

### Sprint 1 — Auth, Security Baseline, Monorepo Setup
**Branch**: main (merged) | **Spec**: §12, §2.2

What was built:
- Full monorepo: Turborepo + pnpm workspaces
- `packages/config` — Zod env validation
- `packages/db` — Drizzle schema stubs + Flyway migration stubs
- `packages/shared` — shared TypeScript types
- `apps/middleware` — Express app with Helmet, CORS, rate limiting
- JWT RS256 auth: login, register, refresh, /me endpoints
- bcrypt password hashing (cost factor 12)
- HttpOnly cookies for refresh tokens
- Zod validation on all auth endpoints
- AriaRequest type with userId type guard
- `apps/backend` — Spring Boot 3 app bootstrapped, Spring Security config
- E2E: `sprint1-auth.spec.ts` — all auth flows covered

Known state:
- JWT keys generated via `scripts/generate-keys.sh`
- Auth routes: POST /auth/register, POST /auth/login, POST /auth/refresh, GET /auth/me, POST /auth/logout

---

### Sprint 2 — Projects, Dashboard, Concept Graph Models
**Branch**: main (merged) | **Spec**: §6, §15

What was built:
- `apps/middleware/src/routes/projects.routes.ts` — CRUD routes
- `apps/middleware/src/routes/graph.routes.ts` — graph proxy routes
- `apps/backend` — ConceptNode.java, ConceptEdge.java, AnalysisJob.java models
- `apps/backend` — AnalysisController.java, ConceptGraphController.java, HealthController.java
- `apps/web/(dashboard)` — Dashboard stats page
- E2E: `sprint2-projects.spec.ts`, `dashboard.spec.ts`, `projects.spec.ts`

Known state:
- Projects routes: GET /projects, POST /projects, GET /projects/:id, PUT /projects/:id, DELETE /projects/:id
- Concept Graph models are JPA entities — DB tables need Flyway migrations (Sprint 5 work)

---

### Sprint 3 — Analysis, GitHub Proxy, Security Hardening
**Branch**: main (merged) | **Spec**: §12, §8A

What was built:
- `apps/middleware/src/routes/analysis.routes.ts`
- `apps/middleware/src/routes/github.routes.ts` — GitHub API proxy stub
- IDOR fix on graph routes (ownership check via JWT userId)
- AriaRequest userId type guard hardened
- Refresh token error shape fixed
- Session state enum guard added
- E2E: `sprint3-analysis.spec.ts`, `security.spec.ts`, `github-auth.spec.ts`

Known state:
- GitHub OAuth routes stubbed — not fully connected to GitHub API yet
- Analysis routes proxy to Java backend

---

### Sprint 4 — Tickets, Sessions, Team, Planning, AI Strategy (Web UI)
**Branch**: main (merged) | **Spec**: §4, §3

What was built:
- `apps/web/src/app/(dashboard)/` — Tickets Kanban, Sessions, Team/Skills, Planning, AI Strategy, Settings pages
- `apps/middleware/src/routes/tickets.routes.ts`, `sessions.routes.ts`, `skills.routes.ts`, `ideas.routes.ts`
- Redirect stubs for /ai and /team routes
- `data-testid` attributes added to all Sprint 4 UI elements for E2E
- E2E: sprint4-tickets, sprint4-sessions, sprint4-planning, sprint4-team, sprint4-settings, sprint4-ai

Known state:
- All Sprint 4 pages are UI shells — show mock/static data; live wiring in Sprint 5
- Routes exist in middleware but some services behind them are stubs

---

## 🔜 Upcoming Sprints (one sprint per spec phase)

| Sprint | Spec phase | Theme |
|---|---|---|
| 5 | Phase 0 | ✅ Core Foundation closeout — Token Gateway, Orchestrator, WebSocket, Flyway, docker-compose, pgvector |
| 6 | Phase 1 | ✅ Safety & Quality — sanitizer, FIM, Anti-Slop, Red Team (local), IP scanner, P0 linter, anti-test-dodging |
| 7 | Phase 2 | ✅ Experience & Memory — `.entiresystem/`, EXPERIENCE.md, ANTI_PATTERNS.md, Shadow Learning hook, /model-transfer *(code-complete, unverified)* |
| 8 | Phase 3 | ✅ Advanced Retrieval — Semantic Chunker, Concept Graph builder, Distillation Engine, Needle-Threading *(code-complete, unverified)* |
| 9 | Phase 4 | ✅ Telemetry & Incidents — OpenTelemetry (basic Prom format), Incident Commander, Migration Orchestrator, Semantic Tripwires *(code-complete, unverified)* |
| 10 | Phase 5 | ✅ Fleet & Speculation — Ed25519-signed envelopes, FleetOutcome log, healing cascade DFS, Deadlock Breaker, shadow branches *(code-complete, unverified)* |
| 11 | Phase 6 | IDE/LSP — ARIA LSP server, VS Code extension, ghost-text diffs, cursor-aware context |
| 12 | Phase 7 | Governance & Legal — Ed25519 agent identity, Compliance Auditor, GDPR erasure, /aria explain, audit export |
| 13 | Phase 8 | Finance & Procurement — FinOps Oracle, Procurement Scout, Stripe Issuing stub, Arbitrage Engine |
| 14 | Phase 9 | Security Protocol & Benchmarking — Chaos Sandbox, Synthetic Hydrator, Replay Engine, SWE-bench Lite gate, Golden Dataset |
| 15 | Phase 10 | HR, Kill Switch, Resilience — Zero-Trust HR, Defcon-1, Historian, Reaper, Weekend Janitor, Seed Vault |
| 16 | Phase 11 | Skill Ecosystem — Talent Acquisition, Skill Quarantine, lazy-load orchestrator |
| 17 | Phase 12 | Growth, Strategy, Meta-Evolution — Synthesizer, Exec Board, Supreme Court, Meta-Evolution Architect |
| 18 | Phase 13 | Horizon Scanner — sources, Hype-vs-Value gate, autonomous PoC, Evolution RFC |
| 19 | Phase 14 | Gradual Autonomy Onboarding — Shadow Mode, Training Wheels, Graduated Autonomy tiers |
| 20 | Phase 15 | Edge Swarm + Predictive Data Gravity — SLM compilation, Behavioural Analyzer, hydration cache |
| 21 | Phase 16 | Genesis & Omnichannel — /genesis-start, Contract-First, Gap Analyzer, Responsive Retrofit |

Full nine-block expansion for every sprint lives in `IMPLEMENTATION.md`.

---

## 📋 Cross-Cutting Coverage Matrix

| Dimension | Status / sprint covering |
|---|---|
| AuthN/AuthZ (RS256, bcrypt-12, refresh cookies) | ✅ Sprint 1 |
| Rate limiting + CORS + Helmet | ✅ Sprint 1 (re-audit every new route) |
| IDOR ownership checks | ✅ Sprint 3 (re-audit every new user-scoped route) |
| Zod validation on every endpoint | ✅ Sprint 1 (enforced) |
| Ed25519 agent identity + signed actions | 🔜 Sprint 12 |
| FIM (SKILL.md / DESIGN.md / DOMAIN_BOUNDARIES.json / CORE_VALUES.yml) | ✅ Sprint 6 |
| Content sanitization (two-stage injection detector) | ✅ Sprint 6 |
| Red Team Saboteur (local pre-merge) | ✅ Sprint 6 |
| Red Team vs Blue Team (chaos every 6h) | 🔜 Sprint 14 |
| Anti-Slop Gate (5 axes) | ✅ Sprint 6 |
| P0 deterministic linter | ✅ Sprint 6 |
| Anti-test-dodging static linter | ✅ Sprint 6 |
| Golden Dataset evaluator regression | 🔜 Sprint 14 |
| SWE-bench Lite CI gate | 🔜 Sprint 14 |
| SWE-bench Verified + WebArena weekly | 🔜 Sprint 14 |
| Token Gateway (queue, reservations, replay frames) | ✅ Sprint 5 |
| Concept Graph + RAG distillation (≥5× compression) | ✅ Sprint 8 *(code-complete, unverified)* |
| State-Space Replay engine | 🔜 Sprint 14 (frames stubbed Sprint 5) |
| Seed Vault (weekly air-gapped archive) | 🔜 Sprint 15 |
| Defcon-1 distributed kill switch | 🔜 Sprint 15 |
| Compliance Auditor (PII/logging/retention/encryption/export) | 🔜 Sprint 12 |
| Legal Kill-Switch (GPL/copyleft) | 🔜 Sprint 6 (scanner) + Sprint 12 (enforcement) |
| GDPR erasure + redaction-aware attestation | 🔜 Sprint 12 |
| Meta-Evolution Architect (Ouroboros) | 🔜 Sprint 17 |
| Horizon Scanner | 🔜 Sprint 18 |
| Gradual Autonomy Onboarding tiers | 🔜 Sprint 19 |
| Edge Swarm (SLM web/iOS/Android) | 🔜 Sprint 20 |
| Predictive Data Gravity (cache pre-warm) | 🔜 Sprint 20 |
| Genesis pipeline | 🔜 Sprint 21 |
| Observability (Prom `/metrics`, OpenTelemetry SDK in Sprint 14) | ✅ Sprint 9 *(code-complete, unverified)* |
| Incident Commander + auto-hotfix | ✅ Sprint 9 *(state machine + REST; auto-hotfix in Sprint 14)* |
| Zero-Downtime Migration Orchestrator | ✅ Sprint 9 *(code-complete, unverified)* |
| Semantic Tripwires (honeypots) | ✅ Sprint 9 *(schema + ADR; install/check loop in Sprint 14)* |
| Auto Precision-session on P0/P1 incident | ✅ Sprint 9 *(gap-fill)* |
| Jira MCP integration | ⚠️ Stub Sprint 9; real MCP Sprint 17 |
| Synthetic Data Hydrator (profiles + cache) | 🔜 Sprint 14 |
| Skill Quarantine | 🔜 Sprint 16 |
| Token-optimisation via MEMORY.md file index | ✅ Sprint 5 (this commit) |

---

## ⚠️ Known Gaps / Tech Debt

- ✅ `docker-compose.yml` lands Sprint 5.
- ✅ Flyway V5 migration ships Sprint 5; Java backend now boots tables cleanly.
- ✅ pgvector extension enabled Sprint 5; embedding column reserved on concept_nodes.
- ✅ Ollama routed through Token Gateway Sprint 5.
- GitHub OAuth callback + token exchange revisit pending (kept Sprint 4 baseline; revisit during Sprint 6/12).
- `.entiresystem/` canonical store partial (only ADRs/ created Sprint 5; full layout Sprint 7).
- `packages/db` Drizzle schemas vs Java JPA entities are aligned for Sprint 5 tables; broader audit still owed Sprint 7.
- Sprint 1-4 ADRs to be backfilled retroactively in Sprint 7 (Sprint 5 ADRs 0001-0003 already live).
- Spring full-context test `AriaBackendApplicationTests` `@Disabled` until Sprint 14 wires Testcontainers.

## 🐛 Open Bugs / Debt (running list)

_None tracked yet — populated as bugs are filed._

## 🔐 Open Security Findings

_None tracked yet — populated by Red Team (Sprint 6) and audits._

## 📐 Open ADRs Awaiting Decision

_None tracked yet — first batch (ADR-0001 through ADR-0003) lands in Sprint 5._

## 🧪 Test Coverage Snapshot

| Package | Lines | Branches | Critical paths | Notes |
|---|---|---|---|---|
| apps/web | tbd | tbd | tbd | E2E covered Sprints 1–4 |
| apps/middleware | tbd | tbd | tbd | Vitest scaffolding to add Sprint 5 |
| apps/backend | tbd | tbd | tbd | JUnit 5 scaffolding to add Sprint 5 |
| apps/e2e | n/a | n/a | n/a | 19 specs across Sprints 1–4 |

Coverage table is auto-refreshed at the end of every sprint after `pnpm test --coverage` and `mvn jacoco:report`.

---

## 📝 Session Notes

- **2026-05-17** — Sprint 8 gap-fill (added `/api/llm/embed`, Pre-Flight Estimator wired into the Token
  Gateway via `expectedCompressionRatio`, EmbeddingClient retargeted) **+** Sprint 9 **code-complete,
  unverified** (NO-RUN MODE): SLO catalogue (ADR-0011), Flyway V9, Java incident + migration packages
  (IncidentCommanderService state machine, MigrationOrchestratorService that never auto-rolls back
  stateful_dangerous/irreversible per ADR-0012), middleware telemetry registry + `/metrics`, incident
  proxy + `/api/incidents`, web `/(dashboard)/system-health` page, ADRs 0011–0013. 16 unrun tests
  (9 Java, 6 Vitest, 4 Playwright). Sprint 10 (Phase 5 — Fleet & Speculation) is queued.
- **2026-05-16 (late night)** — Sprint 8 **code-complete, unverified** (NO-RUN MODE). Built the 4-level
  Concept Graph + Distillation Engine end-to-end: Java `com.aria.graph` package
  (SemanticChunk JPA + repo with native HNSW query, SemanticChunker regex-based per ADR-0009,
  EmbeddingClient routed through the Token Gateway, ConceptGraphBuilder idempotent per version_hash,
  DistillationEngine with ranking per ADR-0010 — ≥5× compression target). Middleware proxy at
  `/api/distill` + Pre-Flight Estimator at `/api/distill/preflight` (20-sample moving average over
  `distillation_runs`). Web graph page gained a 4-level switcher (Symbol / Module / Domain / Decision).
  Flyway V8 schema, `knowledge-review` CLI, 10 new Java tests + 5 new Vitest cases + 5 new Playwright
  cases (all unrun). ADRs 0009 + 0010. Sprint marked `code-complete (unverified)`.
- **2026-05-16 (night)** — Sprint 7 **code-complete, unverified** (NO-RUN MODE per user directive).
  Shipped `.entiresystem/` canonical layout (5 skill subtrees, 3 EXPERIENCE files, 3 ANTI_PATTERNS files),
  ExperienceService + VeracityService + ModelTransferService, `/api/experience` routes, `knowledge-audit`
  and `model-transfer` CLIs, Shadow Learning GitHub Action, Flyway V7 schema, 15 new Vitest tests + 2 new
  Playwright specs (none executed this session), and ADRs 0007 + 0008. CLAUDE.md §5a documents the
  NO-RUN MODE protocol so future sessions handle the same directive consistently.
- **2026-05-16 (evening)** — Sprint 6 closed. Shipped sanitizer + FIM + plagiarism + Red Team + Anti-Slop +
  Anti-Test-Dodging + Turn-1 Discovery Form + device-matrix Playwright + Flyway V6 + CI workflow + signed
  `.entiresystem/` brain files. 29 middleware tests green, 5 Java tests green, web typecheck green. Three
  new ADRs (0004–0006). Found and fixed pre-existing `.gitignore` bug that was silently excluding
  `.entiresystem/` — Sprint 5 ADRs now committed alongside Sprint 6 work.
- **2026-05-16 (afternoon)** — Sprint 5 closed. Full Token Gateway + Java Orchestrator + WebSocket hub + Flyway
  V5 migration + docker-compose stack + pgvector + Ollama wiring + Anthropic stub. Middleware typecheck/test/build
  green, Java tests green, web typecheck green. Three ADRs committed under `.entiresystem/ADRs/`. Existing
  Sprint 1-4 schema/build tech debt (drizzle `timestamptz`, duplicate `SecurityConfig`, missing `Select` UI
  primitive, missing default export on health route) fixed in-flight so the entire monorepo now typechecks
  and builds clean.
- **2026-05-16 (morning)** — Architect planning session. Wrote master plan + MEMORY.md + restructured
  PROGRESS.md. Decisions locked: full-depth 17-phase plan; local-first docker-compose; Ollama-first with
  Anthropic for governance (gated by `ANTHROPIC_API_KEY`); Postgres + pgvector for all storage; Sprint 5–21 =
  one sprint per spec phase. See `IMPLEMENTATION.md` §0 and `MEMORY.md §A`.
