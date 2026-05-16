# ARIA-V1 — Progress Log

> This is the session handoff file. READ at session start, UPDATE at session end.
> Pair with `MEMORY.md` (file index + decisions + anti-patterns) and `IMPLEMENTATION.md` (full 17-phase build plan).

---

## 🔄 Active Sprint

**Sprint 6 — Phase 1: Safety & Quality**  *(queued — start after user review of Sprint 5)*
- Spec anchors: §12 (Security/FIM/Sanitization), §13 (QA/Red Team/IP scanner), §14 (Anti-Slop, Turn-1 Discovery)
- DoD checklist: see IMPLEMENTATION.md §3.

---

## ✅ Completed Sprints

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
| 6 | Phase 1 | Safety & Quality — sanitizer, FIM, Anti-Slop, Red Team (local), IP scanner, P0 linter, anti-test-dodging |
| 7 | Phase 2 | Experience & Memory — `.entiresystem/`, EXPERIENCE.md, ANTI_PATTERNS.md, Shadow Learning hook, /model-transfer |
| 8 | Phase 3 | Advanced Retrieval — Semantic Chunker, Concept Graph builder, Distillation Engine, Needle-Threading |
| 9 | Phase 4 | Telemetry & Incidents — OpenTelemetry, Incident Commander, Migration Orchestrator, Semantic Tripwires |
| 10 | Phase 5 | Fleet & Speculation — Pub/Sub mesh, FleetOutcome, healing cascade guardrail, Deadlock Breaker |
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
| FIM (SKILL.md / DESIGN.md / DOMAIN_BOUNDARIES.json / CORE_VALUES.yml) | 🔜 Sprint 6 |
| Content sanitization (two-stage injection detector) | 🔜 Sprint 6 |
| Red Team Saboteur (local pre-merge) | 🔜 Sprint 6 |
| Red Team vs Blue Team (chaos every 6h) | 🔜 Sprint 14 |
| Anti-Slop Gate (5 axes) | 🔜 Sprint 6 |
| P0 deterministic linter | 🔜 Sprint 6 |
| Anti-test-dodging static linter | 🔜 Sprint 6 |
| Golden Dataset evaluator regression | 🔜 Sprint 14 |
| SWE-bench Lite CI gate | 🔜 Sprint 14 |
| SWE-bench Verified + WebArena weekly | 🔜 Sprint 14 |
| Token Gateway (queue, reservations, replay frames) | ✅ Sprint 5 |
| Concept Graph + RAG distillation (≥5× compression) | 🔜 Sprint 8 |
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
| Observability (OpenTelemetry, Prom, Datadog/Sentry MCP) | 🔜 Sprint 9 |
| Incident Commander + auto-hotfix | 🔜 Sprint 9 |
| Zero-Downtime Migration Orchestrator | 🔜 Sprint 9 |
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
