# MEMORY.md — Persistent Project Memory

> **Read this BEFORE reading any other file.** It's the token-optimisation index.
> Workflow: check `§B File Index` for the path you want. If there's a hit and the SHA matches `git rev-parse HEAD:<path>`,
> use the summary here instead of re-reading. After any real file read, upsert the entry below.

---

## §A Session Journal (newest first)

### 2026-05-16 (night) — Sprint 7 code-complete (NO-RUN MODE)
- Honoured a user "do not run any code" directive: zero `pnpm`/`mvn`/`tsx`/`node`/`playwright`
  invocations this session. Mentally typechecked every file before commit.
- Shipped V27.9 §6 Experience & Memory layer: `.entiresystem/` locked down per **ADR-0007**;
  Knowledge Veracity scoring per **ADR-0008** (`weight × 0.5^(age/half_life)`).
- Services: `ExperienceService` (YAML reader/writer for `.entiresystem/skills/<slug>/experience.yml`,
  idempotent append + dedupe), `VeracityService` (`score`, `rank`, `auditSkill`),
  `ModelTransferService` (writes `.backend/<workspace>/{file_index,skill_headers,experience}.json` +
  `prompts/*.md` — NO LLM, NO NETWORK).
- Routes: `/api/experience` (list / read / audit / append entry / append failure story /
  model-transfer). Authenticated + Zod-strict.
- CLIs: `scripts/knowledge-audit.ts` + `scripts/model-transfer.ts`.
- Shadow Learning GitHub Action drafts an `ai-only` entry on every merged PR and opens a follow-up PR
  for human promotion. Real Ollama scoring deferred to Sprint 17.
- Flyway **V7** — `skill_experience_profiles`, `knowledge_veracity_audits`,
  `shadow_learning_runs`, `backend_workspaces`.
- Tests authored but **not executed**: 15 new Vitest cases (experience / veracity / modelTransfer) +
  2 new Playwright specs.
- CLAUDE.md §5 extended with rule **5a NO-RUN MODE** so future sessions handle the same directive
  consistently. Status reported in two sentences per the user's response-style rule.

### 2026-05-16 (evening) — Sprint 6 closed
- Shipped the V27.9 §12–§14 safety layer: two-stage **sanitizer** with rate-limited defensive posture,
  Ed25519-signed **FIM** over CORE_VALUES / DESIGN / DOMAIN_BOUNDARIES / SKILL, copyleft-aware
  **plagiarism scanner**, deterministic **Red Team probe generator**, 5-axis **Anti-Slop Gate**,
  regex-based **Anti-Test-Dodging linter**, **Turn-1 Discovery Form** with YAML mirror, Playwright **device
  matrix** (1920 / 768 / 375), `.github/workflows/ci.yml`, Flyway **V6** schema.
- Discovered + fixed a `.gitignore` bug that was silently excluding the entire `.entiresystem/` directory —
  Sprint 5 ADRs were never actually pushed. New rule: `.aria/` (private runtime) gitignored,
  `.entiresystem/` (canonical knowledge) committed.
- Created the canonical brain files (CORE_VALUES.yml, DESIGN.md, DOMAIN_BOUNDARIES.json, SKILL.md stub) and
  signed the FIM registry. Daemon Ed25519 key at `.aria/keys/daemon.ed25519`, public key at
  `.entiresystem/keys/daemon.pub`.
- Tests: 29 / 29 middleware (Sprints 5 + 6), 5 / 5 Java orchestrator, web typecheck green. 5 new E2E specs.
- New ADRs: 0004 sanitizer thresholds, 0005 Anti-Slop axes, 0006 FIM signing key custody.

### 2026-05-16 (afternoon) — Sprint 5 closed end-to-end
- Shipped Token Gateway (TS), Java Orchestrator, WebSocket hub, Flyway V5 migration, docker-compose stack,
  pgvector, Ollama init container, web session-status indicator + `useAriaSocket` hook.
- Repaired pre-existing Sprint 1-4 build tech debt so the entire monorepo typechecks/builds clean:
  Drizzle schemas (`timestamptz` → `timestamp` with `withTimezone`), duplicate `SecurityConfig` removed,
  dead `JwtAuthFilter` removed, missing `Select` UI primitive added, missing default export on
  `health.routes.ts` added, `useNodesState<Node>([])` typing on the graph page, JWT filter migrated to
  modern `Jwts.parser().verifyWith(...)` API.
- New ADRs: 0001 (pgvector), 0002 (socket.io), 0003 (Token Gateway in middleware).
- Test status: middleware Vitest 7/7 green, Java orchestrator 5/5 green (+ 1 `@Disabled` context test
  pending Sprint 14 Testcontainers wiring), web typecheck green, middleware build green.
- Branch: `claude/aria-implementation-plan-4GHZI`. Sprint 6 (Phase 1) is the next queued unit of work.

### 2026-05-16 (morning) — Architect planning session
- Audited the local repo and `origin/main`: Sprints 1–4 done; Sprint 5 not started; local in sync.
- Digested V27.9 spec (23 sections, 17 phases). Captured contracts for every section.
- User locked decisions: full-depth plan for all 17 phases; local-first docker-compose; Ollama-first with Anthropic
  gated behind `ANTHROPIC_API_KEY`; Postgres + pgvector for all storage; Sprint 5–21 = one sprint per spec phase
  (17 phases needs 17 sprints, so we extend beyond user's "5–16" by 5 sprints — documented in `IMPLEMENTATION.md §0`).
- Wrote `IMPLEMENTATION.md` (full 17-phase 9-block plan), `MEMORY.md` (this file), restructured `PROGRESS.md`
  (preserved Sprint 1–4 content, added cross-cutting coverage matrix).
- Branch: `claude/aria-implementation-plan-4GHZI`. Working tree state at end of session: 3 new docs committed.
- Open question parked: confirm Sprint 5–21 (17) vs Sprint 5–16 (12 — would require collapsing phases).

---

## §B File Index — path | purpose | last-read-sha | summary

> SHA refers to `git rev-parse HEAD:<path>` at time of last read. Refresh whenever a file is touched.

### Root
- **`docker-compose.yml`** | Local stack: postgres(+pgvector), redis, ollama(+init), middleware, backend, web | sha:`HEAD@S5` |
  Volumes `aria-pg-data`, `aria-redis-data`, `aria-ollama-models`. `ollama-init` container pulls
  `qwen2.5-coder:7b` + `nomic-embed-text`. Backend uses `SPRING_DATASOURCE_URL` + `?stringtype=unspecified`
  for String↔UUID interop. All env values come from `.env.local`.
- **`Dockerfile.{web,middleware,backend}`** | Multi-stage builds | sha:`HEAD@S5` |
  Web/middleware use Node 20 alpine with pnpm via corepack. Backend uses `maven:3.9-eclipse-temurin-21` for
  build and `eclipse-temurin:21-jre-alpine` for runtime. Flyway migrations are baked into the backend JAR
  via the pom.xml resources mapping.
- **`scripts/dev-up.sh` / `dev-down.sh` / `db-migrate.sh`** | Local bring-up + standalone Flyway runner | sha:`HEAD@S5` |
  `dev-up.sh` runs `generate-keys.sh` if missing, seeds `.env.local` from `.env.example` with PEM keys, then
  `docker compose up -d --build`. `db-migrate.sh` runs Flyway via a one-shot Docker container.
- **`.entiresystem/ADRs/ADR-0001-pgvector.md`** | pgvector for all embeddings/graph | sha:`HEAD@S5` |
  **`ADR-0002-socket-io.md`** | socket.io over native ws | sha:`HEAD@S5` |
  **`ADR-0003-token-gateway-in-middleware.md`** | Token Gateway lives in Node middleware | sha:`HEAD@S5` |
- **`.entiresystem/CORE_VALUES.yml`/`DESIGN.md`/`DOMAIN_BOUNDARIES.json`/`SKILL.md`** | sha:`HEAD@S6+` | FIM-signed brain files.
- **`.entiresystem/EXPERIENCE/{EXPERIENCE,frontend-web_EXPERIENCE,backend-api_EXPERIENCE,security_EXPERIENCE}.md`** | sha:`HEAD@S7` | cross-cutting + per-persona lessons, every entry tagged with a Veracity tag.
- **`.entiresystem/ANTI_PATTERNS/{auth,database,ux}_ANTI_PATTERNS.md`** | sha:`HEAD@S7` | per-domain forbidden patterns.
- **`.entiresystem/skills/<slug>/{SKILL.md,experience.yml}`** | sha:`HEAD@S7` | **12 personas** wired up: backend-api-specialist, frontend-web-specialist, db-specialist, devops-engineer, qa-e2e, security-engineer, compliance-auditor, finops-oracle, historian, ux-defender, integration-engineer, knowledge-graph-architect.
- **`.entiresystem/README.md`** | sha:`HEAD@S7` | Full layout reference + per-directory rules + `pnpm knowledge-audit` / `pnpm model-transfer` quickstart.
- **`.entiresystem/ADRs/ADR-{0007,0008}-*.md`** | sha:`HEAD@S7` | canonical layout + Knowledge Veracity scoring.
- **`packages/db/flyway/migrations/V7__sprint7_experience_memory.sql`** | sha:`HEAD@S7` | `skill_experience_profiles`, `knowledge_veracity_audits`, `shadow_learning_runs`, `backend_workspaces`.
- **`apps/middleware/src/services/experience.service.ts`** | sha:`HEAD@S7` | Dep-free YAML reader/writer for skill experience profiles. Knowledge Veracity tags enforced at the helper level (defaults `ai-only`).
- **`apps/middleware/src/services/veracity.service.ts`** | sha:`HEAD@S7` | ADR-0008 scoring + `auditSkill` with stale-entry thresholds (`ai-only` < 0.10, `human-approved` < 0.50).
- **`apps/middleware/src/services/modelTransfer.service.ts`** | sha:`HEAD@S7` | `/model-transfer` zero-token tool. Writes `file_index.json` (sha256), `skill_headers.json` (frontmatter), `experience.json` (ranked), and `prompts/<slug>.md`. NO LLM, NO NETWORK.
- **`apps/middleware/src/{schemas/experience,controllers/experience,routes/experience}.ts`** | sha:`HEAD@S7` | Strict Zod schemas + `/api/experience/*` endpoints.
- **`apps/middleware/src/__tests__/{experience,veracity,modelTransfer}.test.ts`** | sha:`HEAD@S7` | 15 Vitest cases (NOT executed — NO-RUN MODE).
- **`scripts/{knowledge-audit,model-transfer}.ts`** | sha:`HEAD@S7` | CLIs.
- **`.github/workflows/shadow-learning.yml`** | sha:`HEAD@S7` | On PR merge, drafts an `ai-only` entry and opens a follow-up PR.
- **`apps/e2e/tests/sprint7-{experience,model-transfer}.spec.ts`** | sha:`HEAD@S7` | 6 Playwright cases (NOT executed — NO-RUN MODE).

- **`packages/db/flyway/migrations/V5__sprint5_token_gateway.sql`** | sha:`HEAD@S5` |
  Enables pgvector. Extends `sessions` with workspace_id, user_id, mode, environment, mission_type,
  mission_risk_appetite, mission_scope, token_budget, time_budget_minutes, is_first_start, brief_summary;
  drops `team_id NOT NULL` constraint; adds CHECK constraints on mode/env/mission_type/state.
  Adds `embedding vector(768)` + `graph_level` on concept_nodes, `graph_level` on concept_edges.
  Creates `replay_frames` (append-only LLM call log) and `token_ledger` (per-session per-backend totals).

- **`CLAUDE.md`** | Master operating manual for Claude Code sessions | sha:`HEAD@2026-05-16` |
  Sections: (1) project purpose, (2) monorepo structure, (3) tech stack table, (4) security rules
  (RS256 only, bcrypt 12, HttpOnly cookies, Zod on all endpoints, IDOR checks, CORS allowlist, rate limit,
  Helmet, no secrets in code), (5) git rules (branch naming `feat/sprint-N-<short>`, commit `type(scope): description`,
  always lint+test before commit), (6) session rules (don't load SPEC.md, one sprint per session, real code only,
  short responses, update PROGRESS.md), (7) SPEC quick reference table, (8) protected files (SPEC.md / CORE_VALUES.yml /
  DESIGN.md / passing E2E specs / generate-keys.sh), (9) env setup, (10) DoD checklist per sprint.

- **`PROGRESS.md`** | Sprint handoff file | sha:`current HEAD` |
  Restructured this session. Sections: active sprint (Sprint 5, DoD checklist), completed sprints (1–4 verbatim),
  upcoming sprints table (5–21), cross-cutting coverage matrix, known gaps, open bugs/security/ADRs, test coverage snapshot,
  session notes.

- **`IMPLEMENTATION.md`** | Master 17-phase build plan | sha:`current HEAD` |
  17 phase sections, each with the 9-block template: Goal / Spec anchors / Deliverables / Tasks /
  Schema additions / Security checklist / Test plan / Review & audit / DoD. Plus §1 cross-cutting standards,
  §19 risk register, §20 external integration matrix, §21 glossary.

- **`v27_9.md`** | Canonical V27.9 spec (~116 KB) | sha:`HEAD@2026-05-16` |
  Digested. Key contracts:
  - §0 purpose, §1 13 core principles (local-first, text-first, agent-as-teammate, governance-by-design, etc.).
  - §2.1 topology = user → LSP → daemon → Orchestrator → Token Gateway → agents/MCP/sandboxes/edge.
  - §2.2 state stores = SQLite (sessions, registries, replay), `.entiresystem/` (canonical brain), `.backend/` (derived),
    `.aria/replay/` (append-only), `.aria/hydration_cache/`.
  - §3 12 role families (Exec/Govern, Product/Biz, Engineering, Mobile, DevOps/SRE, Knowledge/Graph, Quality/Security/Legal,
    Finance/Procurement, HR/Identity, Talent, Meta, Stakeholder Sim).
  - §4 session = (id, projects, scope, env, budget, mode, state); modes plan-only/apply/precision/throughput/design/
    experiment/migration/meta/R&D; many slash commands.
  - §5 action classes A (safe read) / B (bounded auto in dev) / C (dual approval) / D (human only) / E (prohibited).
  - §6 five memory layers (short-term, episodic, structural, long-term, horizon); canonical store `.entiresystem/`.
  - §7 context pre-flight estimator + Needle-Threading.
  - §8 seven sandbox types (Dev/Staging/R&D/Chaos/Benchmark/Tool/Meta) + Replay + Patch.
  - §9 SKILL.md frontmatter (name, description, trigger_keywords, risk_class, domains, source, version) +
    Transparency Card; lazy-loaded; Talent Acquisition + Skill Quarantine.
  - §10 Horizon Scanner — RSS/GitHub Trending/HN/ArXiv/CVE; Hype vs Value 4-axis (Maturity/ROI/Security/Stability);
    autonomous PoC; Evolution RFC.
  - §11 FinOps Oracle pre-flight; budget warn 80% / hard-stop 95%; Procurement Scout.
  - §12 security — Ed25519 agent identity; two-stage injection detector (admit/quarantine/reject scores); FIM on brain files;
    SBOM + Package Provenance Gate; GDPR redaction-aware attestation; Compliance Auditor gate; Legal Kill-Switch on GPL.
  - §13 Outcome Object + Grader; Contract tests; E2E device matrix (1920×1080 / 768×1024 / 375×667);
    Anti-Test-Dodging linter; Red Team Saboteur; IP/Plagiarism Scanner; Golden Dataset 50+ cases weekly.
  - §14 DESIGN.md as law; Turn-1 Discovery Form; Anti-Slop Gate 5 axes; Product Architect (UX Defender); User Advocate;
    Chaos UX Agent; Responsive Retrofit (mobile-first).
  - §15 Business Logic Squad; structured specs; Spec Completeness Checker; Semantic Layer.
  - §16 Genesis (Turn-0): Executive Board → PRD → CTO design → Orchestrator repo create; Contract-First Omnichannel;
    Omnichannel Gap Analyzer.
  - §17 Observability MCP; Incident Commander; Zero-Downtime Migration Playbook; Fleet Commander Pub/Sub
    (`aria-fleet.<epic-id>.*`); healing cascade circuit breaker; Infra Arbitrage Engine.
  - §18 HR Zero-Trust (HRIS MCP, ~300ms revoke); Defcon-1 signed broadcast; Historian (Chesterton's Fence 48–72h pings);
    Reaper (90-day inactivity); Weekend Janitor.
  - §18A Meta-Evolution Architect — analyse/diagnose/draft/meta-test/deploy; hard rollback on Golden Dataset regression;
    cannot alter CORE_VALUES/DESIGN/permissions/safety constraints.
  - §18B Gradual Autonomy — Shadow Mode 7d → Training Wheels (≥20 Class B at trust≥0.90; ≥10 Class C at ≥0.80) →
    Graduated Autonomy tiers (Class B auto / Class C semi / Class D permanent human).
  - §18C Human Friction Auditor — 14-day rolling; vague rejection detection; advisory-only; HARD privacy constraints.
  - §18D Seed Vault — weekly air-gapped encrypted archive; `/aria wake` recovery; quarterly drill.
  - §18E Red Team vs Blue Team every 6h in Chaos Sandbox; Ouroboros Gate re-test after patch.
  - §18F State-Space Replay — `.aria/replay/replay.db` append-only; deterministic for local models;
    P0 incident frames retained indefinitely.
  - §18G Synthetic Data Hydrator — schema-aware faker; profiles (qa/red_team/performance/minimal);
    cache by schema-hash; PII safety check.
  - §18H Token Gateway — Capacity Registry, priority queue (p0_critical/high/normal/low/speculative),
    SIGSTOP/SIGCONT to pause local containers, rolling 60s token window for remote, backpressure at queue depth 50,
    every call writes a ReplayFrame.
  - §18I Deadlock Breaker — heartbeat every 30s, DFS over dependency graph, 3-min timeout, Contract Forcing Event,
    ContractDebt record.
  - §18J Edge Swarm — SLM (1–3B) compiled to Core ML / ONNX / WASM; ≤150MB mobile, ≤50MB web; signed binaries;
    no raw weights extractable.
  - §18K Predictive Data Gravity — Behavioural Pattern Analyzer → Prediction Engine → Hydration Queue → Pre-Generator →
    Redis cache with TTL governance; no PII in keys.
  - §18L Benchmarking — SWE-bench Lite (CI gate), Verified weekly, WebArena weekly, Internal + Golden Dataset.
  - §18M LSP — ghost-text diffs, inline diagnostics, cursor-aware context, inline `/fix /test /explain /red-team
    /compliance /design-check`; hover <100ms, completion <500ms, diagnostics <1s.
  - §18N Concept Graph 4 levels (Symbol / Module / Domain / Decision); Semantic Chunker; Distillation Engine
    target ≥5× compression; `/knowledge-review` maintenance.
  - §19 Growth / Synthesizer / Exec Board / Supreme Court (CORE_VALUES weighted voting) / Auto-Merge Trust Scoring /
    Ouroboros (ARIA-on-ARIA) / Sunset Sequence.
  - §20 System Health Analyst / Misalignment Monitor / Curriculum Planner / Decision Explainer.
  - §21 17 implementation phases (Phase 0 → 16) with dependencies.
  - §22 North Star metrics across engineering/security/autonomy/cost/UX/platform.
  - §23 implementation notes (text-first, build in phases, human primacy on irreversible, hardcoded safety).

### apps/web (Next.js 14 frontend)
- **`apps/web/src/contexts/auth.context.tsx`** | Auth state + login/logout/refresh hooks | sha:tbd-on-first-read |
  Pattern: must `setUser` before `setToken` to avoid OAuth callback race (commit 4532bb0). Provides
  `useAuth()` returning user, token, isAuthenticated, login(), logout(), refresh(). Silent refresh on 401.

- **`apps/web/src/lib/api.ts`** | Fetch wrapper, JWT handling | sha:tbd-on-first-read |
  Wraps `fetch()` with base URL from `NEXT_PUBLIC_MIDDLEWARE_URL`, Authorization header, error shape unwrap.
  Returns `{ data, error }` discriminated union.

- **`apps/web/src/app/(auth)/login/page.tsx`**, **`.../signup/page.tsx`** | Auth screens | sha:tbd |
  Standard shadcn form, calls `useAuth().login()` / signup endpoints; password strength meter.

- **`apps/web/src/app/(dashboard)/layout.tsx`** | Dashboard shell with sidebar nav | sha:tbd |
  Sidebar links: Dashboard / Projects / Tickets / Sessions / Team / Planning / AI Strategy / Settings.
  Need to add live agent-status indicator in Sprint 5.

- **`apps/web/src/app/(dashboard)/dashboard/page.tsx`** | Stats overview | sha:tbd |
  Sprint 3 work: stats cards + activity feed + empty states. Uses `Promise.allSettled` for parallel fetches.

- **`apps/web/src/app/(dashboard)/projects/page.tsx`**, **`projects/[id]/page.tsx`**, **`projects/[id]/graph/page.tsx`**,
  **`projects/[id]/jobs/[jobId]/page.tsx`** | Projects CRUD + analysis job views | sha:tbd |
  Graph uses React Flow (named import — see audit fix in commit 6bb12b2).

- **`apps/web/src/app/(dashboard)/tickets/page.tsx`**, **`sessions/`, `team/`, `planning/`, `ai-strategy/`, `settings/`** |
  Sprint 4 pages | sha:tbd | UI shells with mock/static data. To be wired to live APIs in Sprint 5.

### apps/middleware (Express)
- **`apps/middleware/src/app.ts`** | Express factory + route mounts | sha:`HEAD@S5` |
  Now exports `createApp(env)` factory in addition to the default app. Mounts all Sprint 1-4 routers plus
  Sprint 5 additions: `llmRoutes` at `/api/llm` and `orchestratorRoutes` at `/api/orchestrator`. Order
  unchanged: Helmet → CORS → JSON → cookies → request logger → global rate limit → routes → notFound → errorHandler.

- **`apps/middleware/src/index.ts`** | HTTP server + socket.io attach + graceful shutdown | sha:`HEAD@S5` |
  Creates the express app via factory, wraps in `http.createServer`, attaches socket.io via `createWsServer`,
  closes pg pool + WS + HTTP server on SIGTERM/SIGINT with a 10s forced-exit fallback.

- **`apps/middleware/src/services/tokenGateway.service.ts`** | Single LLM egress | sha:`HEAD@S5` |
  Five-priority queue (p0_critical → speculative). Backpressure at MAX_QUEUE_DEPTH rejects speculative/low.
  Budget enforcement (warn 80% / hard-stop 95%) against `token_ledger`. Dependency-inverted ports:
  `ReplayFrameRepository`, `TokenLedgerRepository`, `BackendDispatcher`. EventEmitter publishes
  `token.warn`, `token.hard_stop`, `queue.depth` for the WS hub to broadcast. ReplayFrame insert happens
  BEFORE dispatch (never silent), updated to `dispatched` then `completed` / `failed`.

- **`apps/middleware/src/services/{dispatcher.ollama,dispatcher.anthropic,replay.repository,ledger.repository,db.client,tokenGateway.factory}.ts`**
  Ollama live dispatch (`POST /api/chat`); Anthropic dispatch gated by `ANTHROPIC_ENABLED` (`POST /v1/messages`);
  pg-backed Replay + Ledger repos plus in-memory variants for tests; singleton `Pool` reading `DATABASE_URL`;
  factory wires backends, dispatchers, repos with env knobs.

- **`apps/middleware/src/{schemas/llm.schemas.ts,controllers/llm.controller.ts,routes/llm.routes.ts}`**
  Zod schema (strict); controller maps `TokenGatewayError.code` to HTTP status (402 budget, 429 queue full,
  400 unknown backend, 502 dispatch); routes rate-limited per minute on top of the global limiter.

- **`apps/middleware/src/{services/orchestrator.proxy.ts,controllers/orchestrator.controller.ts,routes/orchestrator.routes.ts}`**
  Pass-through proxy from middleware to Java backend `/api/orchestrator/sessions/...`. Token forwarded from
  `Authorization: Bearer` header (or `aria_access_token` cookie).

- **`apps/middleware/src/ws/index.ts`** | socket.io hub with RS256 handshake | sha:`HEAD@S5` |
  Path `/ws`. Rooms `workspace.<wid>` (auto-joined), `session.<sid>`, `agent.<aid>`, `system.health`
  (subscribed on demand). Bridges Token Gateway events to the right room.

- **`apps/middleware/src/__tests__/tokenGateway.test.ts`** | Vitest, 7 tests | sha:`HEAD@S5` |
  Covers single dispatch, queue+inflight status, backpressure on speculative, budget hard-stop, unknown
  backend, dispatcher failure → reservation released, priority ordering.

- **`apps/backend/src/main/java/com/aria/orchestrator/*`** | Sprint 5 orchestrator package | sha:`HEAD@S5` |
  `Session` (JPA), `SessionState`/`SessionMode`/`Environment`/`MissionType` enums, `SessionRepository`,
  `OrchestratorService` with strict state-machine transitions + IDOR ownership checks,
  `OrchestratorController` exposing `/api/orchestrator/sessions/{id}/{start|pause|stop|status}`.
  DTOs: `CreateSessionRequest`, `SessionDto`. Enum fields are stored as TEXT with DB-side CHECK constraints
  for Hibernate friendliness.

- **`apps/backend/src/main/java/com/aria/security/SecurityConfig.java`** | Unified security config | sha:`HEAD@S5` |
  Reads `CORS_ORIGINS`. Permits actuator/health endpoints; everything else requires JWT. The legacy
  duplicate at `com.aria.config.SecurityConfig` was removed.

- **`apps/backend/src/main/java/com/aria/security/JwtAuthenticationFilter.java`** | sha:`HEAD@S5` |
  Migrated to Jwts 0.12 `parser().verifyWith(key).build().parseSignedClaims(...)` API. Populates
  `AriaAuthentication(userId, email, name, workspaceId, jti)`.

- **`apps/backend/src/main/resources/application.yml`** | sha:`HEAD@S5` |
  Datasource URL builds from POSTGRES_HOST/PORT/DB/USER/PASSWORD (or `SPRING_DATASOURCE_URL` override),
  appends `?stringtype=unspecified` for String↔UUID columns. Flyway is now enabled and reads
  `classpath:db/migration` (Flyway resources baked into the JAR via pom.xml).

- **`apps/backend/src/test/java/com/aria/orchestrator/OrchestratorServiceTest.java`** | JUnit 5 + Mockito, 5 tests | sha:`HEAD@S5` |
  create defaults, start transition, pause guard, IDOR block, stop completes.

- **`apps/backend/src/test/resources/application-test.yml`** | sha:`HEAD@S5` |
  Disables DataSource/JPA/Flyway autoconfigure for the test profile so unit tests do not need Postgres.

- **`apps/web/src/hooks/useAriaSocket.ts`** | typed WS hook | sha:`HEAD@S5` |
  Loads token from localStorage, opens socket.io to `${NEXT_PUBLIC_WS_URL}/ws` with `auth.token`, surfaces
  `connected` + last typed event + `subscribe(room)` / `unsubscribe(room)`.

- **`apps/web/src/components/SessionStatus.tsx`** | dashboard sidebar indicator | sha:`HEAD@S5` |
  Shows live WS connection state, queue depth, last token alert (warn / hard_stop). `data-testid="session-status"`.

- **`apps/web/src/components/ui/select.tsx`** | shadcn-flavoured Select | sha:`HEAD@S5` |
  Native `<select>` under the hood — keeps the bundle small and gets accessibility for free. Same import
  surface (`Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`) used by Sprint 4 pages.

- **`apps/e2e/tests/sprint5-{token-gateway,orchestrator,websocket}.spec.ts`** | 8 Playwright tests | sha:`HEAD@S5` |
  Unauth + auth status, Zod-rejected empty body, sidebar indicator render, full state-machine round-trip,
  IDOR (signup-as-other-user), unauth handshake rejected, auth handshake emits `hello`.



- **`apps/middleware/src/config/jwt.ts`** | RS256 sign/verify with PEM keys | sha:tbd |
  Reads `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` from env (via packages/config Zod schema). Issues access tokens
  (15-min TTL) and refresh tokens (30-day TTL). Will be reused for agent token signing in Sprint 12.

- **`apps/middleware/src/middleware/auth.middleware.ts`** | JWT verify + AriaRequest type guard | sha:tbd |
  Extends Express Request with `userId` populated from verified JWT. Must be reused on WebSocket handshake (Sprint 5).

- **`apps/middleware/src/routes/*`** | 11 route files | sha:tbd |
  auth, projects, tickets, sessions, skills, graph, analysis, ai, ideas, github, health. Each follows pattern:
  `router.METHOD(path, validate(zodSchema), authMiddleware, controller.handler)`.

- **`apps/middleware/src/services/*`** | 10 services | sha:tbd |
  auth, projects, tickets, sessions, skills, analysis, github-oauth, ideas, ollama, backend (HTTP proxy to Java).
  Pattern: pure async functions that take typed args and return typed results; errors thrown, caught by middleware.

- **`apps/middleware/src/schemas/auth.schemas.ts`**, **`project.schemas.ts`** | Zod request schemas | sha:tbd |
  Need to add schemas every new endpoint. Reject on unknown keys (`.strict()`).

### apps/backend (Spring Boot 3, Java 21)
- **`apps/backend/src/main/java/com/aria/AriaBackendApplication.java`** | Entry point | sha:tbd |
  Standard `@SpringBootApplication`.

- **`apps/backend/src/main/java/com/aria/security/SecurityConfig.java`** | Spring Security + JWT filter | sha:tbd |
  Uses `JwtAuthFilter` + `JwtKeyProvider` (loads RS256 public key). Stateless session policy. Permits health/auth,
  authenticates everything else.

- **`apps/backend/src/main/java/com/aria/security/AriaAuthentication.java`** | Java record for JWT principal | sha:tbd |
  Holds userId, roles. Returned by JwtAuthFilter.

- **`apps/backend/src/main/java/com/aria/model/`** | JPA entities ConceptNode, ConceptEdge, AnalysisJob | sha:tbd |
  Need Flyway migrations (Sprint 5).

- **`apps/backend/src/main/java/com/aria/controller/`** | AnalysisController, ConceptGraphController, HealthController |
  sha:tbd | Standard `@RestController` with `@PreAuthorize`-ish ownership checks via session principal.

- **`apps/backend/src/main/java/com/aria/repository/`** | Spring Data JPA repositories | sha:tbd | One per entity.

- **`apps/backend/pom.xml`** | Maven build | sha:tbd | Java 21, Spring Boot 3.x, Postgres driver, Flyway core
  (migrations not yet authored).

### apps/e2e (Playwright)
- **`apps/e2e/playwright.config.ts`** | Playwright config | sha:tbd |
  Currently desktop-only. Sprint 6 will add tablet 768×1024 and mobile 375×667 projects.

- **`apps/e2e/tests/`** | 19 test files | sha:tbd |
  Sprint-prefixed specs (sprint1-auth, sprint2-projects, sprint3-analysis, sprint4-* x6) plus auth/, projects/,
  dashboard, security, github-auth, global.setup. Helpers in `helpers/` include `loginAsTestUser`, `createProject`,
  `deleteProject` (added commit 7b89cb5).

### packages
- **`packages/shared/src/types/*`** | Shared TS types | sha:tbd |
  auth, user, project, ticket, session, skill, workspace, graph, analysis, idea. Aligned to Drizzle schema as of
  commit 5bee096.

- **`packages/db/src/schema/*`** | Drizzle table definitions | sha:tbd |
  users, workspaces, projects, refresh-tokens, sessions, tickets, skills, ideas, analysis-jobs, concept-graph, memory.
  No Flyway equivalent yet — Sprint 5 generates Flyway `V1__init.sql` → `V8__*.sql` mirroring these schemas.

- **`packages/db/drizzle.config.ts`** | Drizzle Kit config | sha:tbd | Reads `DATABASE_URL`.

- **`packages/db/src/client.ts`** | Postgres client (postgres.js) | sha:tbd | Singleton connection pool.

- **`packages/config/src/env.ts`** | Root Zod env schema | sha:tbd |
  Validates DATABASE_URL, JWT_PRIVATE_KEY, JWT_PUBLIC_KEY, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, OLLAMA_BASE_URL,
  CORS_ORIGIN, port numbers. Will extend Sprint 5 to add `ANTHROPIC_API_KEY` (optional), `ANTHROPIC_ENABLED` flag,
  `REDIS_URL`, `MAX_SESSION_TOKEN_BUDGET`.

### scripts
- **`scripts/generate-keys.sh`** | Generates RS256 JWT keypair (PEM) | sha:tbd |
  Outputs to `keys/jwt-private.pem` and `keys/jwt-public.pem`. Protected per CLAUDE.md §8.

---

## §C Decision Log (mini-ADR)

- **DEC-001 — Postgres + pgvector for all storage** (2026-05-16). Chose over Qdrant / Neo4j for single backup story,
  local-first simplicity, and adequate scale (~1M nodes). Will revisit in Sprint 8 when Concept Graph load-tests.
- **DEC-002 — Local-first only, single docker-compose** (2026-05-16). No cloud IaC; matches V27.9 §1 (local-first daemon).
- **DEC-003 — Ollama-first + Anthropic for governance** (2026-05-16). qwen2.5-coder + nomic-embed-text local;
  Anthropic remote ONLY for security/schema/CORE_VALUES gated by `ANTHROPIC_ENABLED` env flag.
  Default models when key granted: `claude-sonnet-4-6` routine, `claude-opus-4-7` high-stakes.
- **DEC-004 — Sprint = Phase (1:1)** (2026-05-16). Sprint 5–21 cover spec Phase 0–16. User asked for "Sprint 5–16,
  one per phase"; 17 phases require 17 sprints, hence 5–21. Parked for confirmation but proceeding.
- **DEC-005 — Token Gateway lives in middleware** (2026-05-16, locking in IMPLEMENTATION.md §2 / ADR-0003 in Sprint 5).
  Reason: closer to Express WS hub, can reuse JWT auth and rate-limit infra. Java backend talks to it via HTTP.
- **DEC-006 — socket.io over native ws** (2026-05-16, ADR-0002 in Sprint 5). Auto-reconnect, room semantics,
  fallback transports, mature TS types. Cost: slightly heavier than `ws`. Acceptable for local-first.
- **DEC-007 — MEMORY.md is the canonical token-optimisation index** (2026-05-16). Replaces ad-hoc file rereads.
  Update protocol in §H of this file.
- **DEC-008 — `.entiresystem/` canonical layout locked** (2026-05-16, Sprint 7, ADR-0007). The committed tree
  is the single source of truth for ARIA knowledge; `.backend/<workspace>/` is derived; `.aria/` is private
  runtime.
- **DEC-009 — Knowledge Veracity 3-tag taxonomy** (2026-05-16, Sprint 7, ADR-0008). `human-authored` ∞,
  `human-approved` 365d half-life, `ai-only` 30d. Score = `weight × 0.5^(age/half_life)`. Defaults to
  `ai-only` everywhere agents write — only humans promote.
- **DEC-010 — NO-RUN MODE protocol** (2026-05-16, Sprint 7, CLAUDE.md §5a). When user says "do not run any
  code", do not execute pnpm/mvn/tsx/node/playwright; mentally typecheck; mark sprint
  `code-complete (unverified)`. Stay in NO-RUN MODE for the rest of the session unless lifted.

---

## §D Anti-Patterns Observed (per-file lessons + behavioural)

### Behavioural anti-patterns (operating principles for me, the assistant)
- **Two-sentence response rule.** User wants ALL responses kept to two sentences max. Exceptions: (1) clarifying
  questions when blocked, and (2) the actual content of files I edit. The two-sentence rule overrides the default
  "say what you found" instinct — keep summaries minimal.
- **10,000% finished before declaring done.** When user says "start Sprint N", don't report completion until the
  sprint's FULL DoD checklist in PROGRESS.md is green, every file is committed, tests pass, and an audit + re-audit
  pass has been done. Nothing left for the next sprint to clean up.
- **Don't ship partial work.** User has had prior sessions where the model handled only a few lines at a time,
  produced limited responses, and didn't finish the area it started. Complete the full sprint scope, not isolated
  fragments. If work is too large for one turn, finish a coherent unit and tell the user explicitly what's done —
  never go silent mid-area.
- **Don't bail on hard work.** When a step fails (test red, compile error, schema clash), diagnose root cause
  and fix it. Don't strip features to "make it green". Don't `--no-verify`. Re-stage and create a new commit.
- **Always update MEMORY.md and PROGRESS.md at the end of every working session.** Even a 30-minute session.
  The file index is the only thing keeping token spend sustainable across sessions.
- **Drive to a runnable state every commit.** `pnpm dev` must boot the full stack; tests must pass. If you
  break a service, fix it in the same commit or revert.
- **Act like the owner of the product.** Production-grade quality on security / dev / testing — no shortcuts,
  no TODOs left behind, no "we'll fix this later". User has explicitly delegated ownership.

### Per-file lessons

- **`apps/web/src/contexts/auth.context.tsx`** — `setToken` must trigger `setUser` immediately or OAuth callback
  redirects to /login due to user=null race. (commit 4532bb0)
- **`apps/middleware/src/app.ts`** — GitHub OAuth routes were unreachable when mounted at top level due to Express prefix
  conflict; must mount **inside** authRouter. (commit 2fbf8f0)
- **Drizzle schemas vs shared TS types** — drift between them caused runtime errors; types must derive from schema or be
  kept in lock-step. (commit 5bee096) Generate types from Drizzle in Sprint 5.
- **Refresh token persistence** — GitHub OAuth users had `REFRESH_TOKEN_INVALID` on silent refresh because tokens weren't
  persisted to DB. Fixed by saving refresh tokens for OAuth users too. (commit af58828)
- **React Flow named import** — default import breaks build; must use named import for ReactFlow. (commit 6bb12b2)
- **`projects/page.tsx`** — needed explicit error state on API load failure; otherwise UI hangs. (commit eca36e6)
- **Dashboard fetches** — use `Promise.allSettled` not `Promise.all` so one failure doesn't blank the dashboard.
  (commit 7f82f15)

---

## §E External Keys & Integration Status

| Key / Service | Status | Notes |
|---|---|---|
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` | ✅ Configured | Generated by `scripts/generate-keys.sh`; PEM RS256 |
| `DATABASE_URL` | ⚠️ Local Postgres only | docker-compose lands Sprint 5 |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | ✅ Configured | OAuth flow live; callback wired |
| `OLLAMA_BASE_URL` | ⚠️ Assumed `http://localhost:11434` | Models needed: `qwen2.5-coder`, `nomic-embed-text` |
| `ANTHROPIC_API_KEY` | ❌ Not yet granted | Token Gateway has backend stubbed; `ANTHROPIC_ENABLED=false` |
| `REDIS_URL` | ❌ Not yet provisioned | docker-compose lands Sprint 5 |
| Datadog / Sentry / OpenTelemetry exporter | ❌ Not yet | Sprint 9 |
| Stripe Issuing | ❌ Not yet | Sprint 13 (stub only until keys granted) |
| HRIS (Workday/Gusto/BambooHR) | ❌ Not yet | Sprint 15 (MCP stub) |
| Jira / Linear MCP | ❌ Not yet | Sprint 9 (Incident Commander) + Sprint 17 (ARIA Proposals board) |
| Slack / Teams MCP | ❌ Not yet | Sprint 15 (Defcon-1 alerts, Historian pings) |

---

## §F Open Questions for User

1. **Sprint 5–16 vs 5–21 numbering** — spec has 17 phases, so 1:1 mapping needs 17 sprints. Currently proceeding
   with 5–21; confirm or collapse phases?
2. **Anthropic model defaults** — when key granted, default to `claude-sonnet-4-6` for routine governance and
   `claude-opus-4-7` for high-stakes Security/Schema/CORE_VALUES decisions. OK?
3. **Seed Vault location** — local-only deployment; default to `~/.aria/seed-vault/` encrypted with `age`. OK?
4. **VS Code extension distribution** — Sprint 11 ships an extension. Publish to VS Code Marketplace, or keep
   it side-loaded (.vsix) until later?
5. **Edge Swarm scope** — Sprint 20 scaffolds iOS/Android mobile stubs but full mobile apps are out of scope. Confirm
   web (Transformers.js / WASM) is the only production target for now?

---

## §G Backlog (small follow-ups, not in current sprint)

- Backfill ADRs for Sprints 1–4 retroactively once `.entiresystem/ADRs/` exists (Sprint 7).
- Sweep `packages/db` for Drizzle schemas that drift from Java JPA entities; pick one source of truth (probably
  Flyway SQL with Drizzle reading via `drizzle-kit pull`).
- Generate API types from OpenAPI spec automatically (`openapi-typescript`) in CI from Sprint 9.
- Add `data-testid` audit linter to ensure every actionable element has one (currently manual).
- Move CLAUDE.md §7 SPEC reference table into MEMORY.md §B as the v27_9.md summary entry (already done in this file).

---

## §H Update Protocol

**Before reading any file:**
1. `grep -n "<path>" MEMORY.md` (inside §B).
2. If hit and the file's current SHA matches the stored SHA → use the summary; do NOT re-read.
3. If miss or SHA changed → read the file once, then upsert §B with the new SHA and a tight summary.

**After any code/file change:**
1. Update the corresponding §B entry (new summary + new SHA).
2. If the change is architectural → append to §C.
3. If a new failure mode was discovered → append to §D.
4. If a new integration is added or its status changed → update §E.

**At session end:**
1. Append a short entry to §A (date, what was done, decisions, blockers).
2. Move resolved §F questions out (record answer in §C).
3. Move stale §G items into a sprint or close them.
4. Commit MEMORY.md alongside the day's code changes.

**Hard rules:**
- Never delete §C entries; they are the project's decision history.
- Never delete §A entries; they are the audit trail.
- Re-reading a file is allowed if the SHA changed or the summary is missing — but the goal is to reduce token spend,
  so update §B aggressively.
