# ARIA-V1 — Progress Log

> This is the session handoff file. READ at session start, UPDATE at session end.
> Pair with `MEMORY.md` (file index + decisions + anti-patterns) and `IMPLEMENTATION.md` (full 17-phase build plan).

---

## 🔄 Active Sprint

**Sprint 12 — Phase 7: Governance & Legal**  *(queued)*
- Spec anchors: §12 (Security / FIM / Auth identity), §13.7 (Legal / Compliance), §20 (Decision Explainer).
- DoD checklist: see IMPLEMENTATION.md §9.

---

## ✅ Completed Sprints

### Sprint 11 — Phase 6: IDE / LSP Integration  *(code-complete, unverified — NO-RUN MODE)*
**Branch**: `claude/aria-implementation-plan-4GHZI` | **Spec**: §18M

What was built:
- **Flyway V11** — `file_locks` (Redis mirror + TTL audit) and `lsp_diff_decisions` (append-only
  ghost-text accept/reject log).
- **`apps/middleware/src/services/fileLock.service.ts`** — Redis-backed `acquire` (`SET NX EX`),
  `release` (holder-verified), `refresh`, `inspect`. Postgres mirror is best-effort; Redis is
  authoritative.
- **`apps/middleware/src/{schemas,controllers,routes}/lsp.*.ts`** — Zod-strict `/api/lsp/*`
  surface: locks (acquire/release/refresh/inspect), hover (proxies the Concept Graph
  distillation), diff decision log, inline task dispatch. Auth-gated + per-route rate-limited.
- **`apps/lsp-server/`** — new TypeScript LSP server package. Hover provider hits
  `/api/lsp/hover`. Six `executeCommand` actions (`aria.dispatch.{fix,test,explain,redTeam,
  compliance,designCheck}`) plus diff and lock helpers. stdio transport in Sprint 11;
  WebSocket in Sprint 14.
- **`extensions/vscode-aria/`** — VS Code extension scaffold that boots the bundled LSP server,
  forwards config (`aria.middlewareUrl`, `aria.agentId`, `aria.projectId`), and registers the
  six command palette entries.
- **`.github/workflows/autonomous-rebase.yml`** — Autonomous Rebase Loop that auto-resolves
  only lockfile / formatter conflicts and labels everything else `rebase-needed`.
- **Sprint 10 gap-fill (rolled in)**: `@EnableScheduling` on `AriaBackendApplication`,
  `FleetScheduler` (`@Scheduled` heal scan @ 30 s + deadlock sweep @ 60 s), `JiraWebhookController`
  (HMAC-SHA256-verified `/api/fleet/jira-webhook` that opens shadow branches), middleware
  `services/fleet.events.ts` in-process bus + WebSocket bridge for `fleet.<epicId>` and
  `system.health` rooms.
- **Tests** (authored, NOT executed — NO-RUN MODE):
  - Java JUnit: `JiraWebhookControllerTest` (4).
  - Middleware Vitest: `fileLock.test.ts` (7 schema cases).
  - LSP package Vitest: `apps/lsp-server/src/__tests__/server.test.ts` (2 hover-render cases).
  - Playwright: `sprint11-lsp.spec.ts` (4 surface cases).
- **ADRs**: 0016 LSP protocol extensions + perf budgets, 0017 File lock TTL + holder enforcement.

Known state (NO-RUN MODE):
- All code mentally typechecked; no `pnpm` / `mvn` / `tsx` / `node` / `playwright` invoked.
- Diagnostics streaming, `aria/lockState` notification, and the WebSocket LSP transport are
  Sprint 14 work (the API surface is reserved in ADR-0016 to avoid future breakage).
- VS Code extension `.vsix` packaging needs `vsce`; `pnpm dlx @vscode/vsce` once NO-RUN lifts.

---

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
| 11 | Phase 6 | ✅ IDE/LSP — ARIA LSP server, VS Code extension, ghost-text diffs, cursor-aware context, Redis file locks, autonomous-rebase workflow *(code-complete, unverified)* |
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
