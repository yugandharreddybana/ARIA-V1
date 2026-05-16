# ARIA-V1 IMPLEMENTATION PLAN (V27.9)

> Master build plan. Pair with `PROGRESS.md` (live sprint state) and `MEMORY.md` (file index + decisions).
> **Token-optimisation:** before reading any code file, check `MEMORY.md §B`. Don't re-read what's already summarised.

---

## §0 Index + How to Use This Doc

| Section | Topic |
|---|---|
| §1 | Cross-cutting standards (apply to every sprint) |
| §2 | Phase 0 — Core Foundation (Sprint 5) |
| §3 | Phase 1 — Safety & Quality (Sprint 6) |
| §4 | Phase 2 — Experience & Memory (Sprint 7) |
| §5 | Phase 3 — Advanced Retrieval (Sprint 8) |
| §6 | Phase 4 — Telemetry & Incidents (Sprint 9) |
| §7 | Phase 5 — Fleet & Speculation (Sprint 10) |
| §8 | Phase 6 — IDE/LSP Integration (Sprint 11) |
| §9 | Phase 7 — Governance & Legal (Sprint 12) |
| §10 | Phase 8 — Finance & Procurement (Sprint 13) |
| §11 | Phase 9 — Security Protocol & Benchmarking (Sprint 14) |
| §12 | Phase 10 — HR, Kill Switch, Resilience (Sprint 15) |
| §13 | Phase 11 — Skill Ecosystem (Sprint 16) |
| §14 | Phase 12 — Growth, Strategy, Meta-Evolution (Sprint 17) |
| §15 | Phase 13 — Horizon Scanner (Sprint 18) |
| §16 | Phase 14 — Gradual Autonomy Onboarding (Sprint 19) |
| §17 | Phase 15 — Edge Swarm & Predictive Data Gravity (Sprint 20) |
| §18 | Phase 16 — Genesis & Omnichannel (Sprint 21) |
| §19 | Risk register |
| §20 | External integration matrix |
| §21 | Glossary |

**Each phase section follows the 9-block template:**
1. **Goal** — 1–2 sentences.
2. **Spec anchors** — V27.9 §X.Y references.
3. **Deliverables** — concrete files, endpoints, UI screens, CLI commands.
4. **Tasks** — numbered, ordered, with file paths.
5. **Schema/contract additions** — Drizzle, Flyway, OpenAPI, JSON schema diffs.
6. **Security checklist** — new attack surface and mitigations; action class.
7. **Test plan** — unit + integration + contract + E2E + visual + Red Team + benchmarks.
8. **Review & audit** — ADRs, Compliance Auditor triggers, dual-agent approvals.
9. **Definition of Done** — checklist that closes the sprint.

**Sprint numbering note:** the spec has 17 phases (0–16). User asked for "Sprint 5–16, one per phase". 1:1 fidelity
requires 17 sprints, hence this plan runs through Sprint 21. Confirm or collapse in MEMORY.md §F.

---

## §1 Cross-Cutting Standards

### 1.1 Definition of Done (every sprint, no exceptions)

- Code compiles: `pnpm typecheck && mvn -pl apps/backend compile`.
- Lint passes: `pnpm lint && mvn -pl apps/backend checkstyle:check && pnpm format:check`.
- **Unit tests** pass; new code has ≥80% branch coverage and **100% on security-critical paths** (auth, IDOR,
  signature verification, sanitization, FIM).
- **Integration tests** pass for any new cross-service interaction.
- **Contract tests** pass for any OpenAPI / event-schema change.
- **E2E spec** for the sprint passes on all three viewports (1920×1080, 768×1024, 375×667).
- **Visual diff** baselines updated only when intentional; pixel diff <0.1% otherwise.
- **Red Team** (from Sprint 6 onward) returns zero critical/high on changed routes.
- **Anti-Slop Gate** + **Anti-Test-Dodging linter** green.
- Zero new IDOR, missing Zod schema, hardcoded secret, or unprotected route.
- ADR written for every architectural decision; ADRs land in `.entiresystem/ADRs/` (Sprint 7 onward; before that
  inline in `IMPLEMENTATION.md` and migrated retroactively).
- `MEMORY.md §B` updated for every file touched (path + SHA + summary).
- `PROGRESS.md` updated: active → done, coverage matrix tick, gaps closed, session note appended.
- PR opened on `feat/sprint-N-<short>`; squash-merge to `main` after CI green and approval.
- Feature branch deleted post-merge.

### 1.2 Security Baseline (every sprint)

| Control | Rule |
|---|---|
| JWT | RS256 asymmetric only. No HS256 anywhere. |
| Passwords | bcrypt cost 12 (minimum). |
| Refresh tokens | HttpOnly + SameSite=Lax cookies; Secure in prod. Never localStorage. |
| Input validation | Zod schema in `apps/middleware/src/schemas/*` for every endpoint. `.strict()` to reject unknown keys. |
| Ownership | `userId` from JWT, never request body. Verify on every user-scoped route. |
| CORS | Explicit allowlist; no wildcards. |
| Rate limit | All auth + write endpoints. |
| Helmet | All responses; CSP refined per page. |
| Secrets | `.env.local` only via `packages/config` Zod schema. Never committed; never logged. |
| Untrusted content | Mark `untrusted_external_data`; two-stage injection detector (Sprint 6+) gates ingestion. |
| FIM | SKILL.md / DESIGN.md / DOMAIN_BOUNDARIES.json / CORE_VALUES.yml hashed and signed (Sprint 6+); mismatch → `CONFIG_DRIFT_ALERT`. |
| SBOM | Generated weekly from Sprint 6; license + CVE scan; Package Provenance Gate blocks suspicious adds. |
| Agent identity | Ed25519 keypair per agent (Sprint 12); all actions signed. |
| Audit | Append-only audit log; minimum 7-year retention; `/aria export-audit-trail` (Sprint 12). |
| Encryption | AES-256-GCM at rest; TLS 1.3 in transit; quarterly key rotation. |

### 1.3 Testing Pyramid

| Layer | Tool | Path | Gate |
|---|---|---|---|
| Unit | Vitest (TS), JUnit 5 (Java) | colocated `*.test.ts`, `src/test/java/...` | required per new file |
| Integration | Vitest + supertest, Spring `@SpringBootTest` | `apps/*/src/__tests__/integration/` | required per service edge |
| Contract | OpenAPI conformance (Schemathesis) + Pact for events | `apps/e2e/contract/` | required per API/event change |
| E2E | Playwright + Chromium (device matrix) | `apps/e2e/tests/sprintN-*.spec.ts` | required per feature |
| Visual diff | Playwright `toHaveScreenshot` | `apps/e2e/visual/` | pixel diff <0.1% |
| Red Team | Adversarial fuzzers (SQLi/XSS/CSRF/IDOR/mass-assign) | `apps/e2e/red-team/` (Sprint 6) | no critical/high to merge |
| Anti-Slop Gate | 5-axis scoring (Philosophy/Hierarchy/Execution/Specificity/Restraint) | CI workflow | P0 hard-fail |
| Anti-Test-Dodging | AST linter (no-assertion / trivial / state-independent rejected) | CI workflow | hard-fail |
| Golden Dataset | 50+ known-bad cases, evaluator regression | `.entiresystem/golden_dataset/` (Sprint 14) | weekly; 100% must pass |
| Benchmarks | SWE-bench Lite (deploy gate), Verified + WebArena (weekly) | `apps/benchmarks/` (Sprint 14) | Lite 100% on PR |

### 1.4 Review & Audit Workflow

- **Class A (read/lint/summarise):** auto-execute; log only.
- **Class B (bounded dev sandbox):** auto-execute; PR review required.
- **Class C (security/schema/cross-repo):** dual-agent approval (Security + Domain Specialist) + human PR review.
- **Class D (merge to main, deploy, destructive migration, secrets):** human approval mandatory.
- **Class E:** prohibited.

- Every architectural decision → ADR in `.entiresystem/ADRs/ADR-XXXX.md` (Sprint 7 onward; backfill earlier).
- Compliance Auditor (Sprint 12) gates any ticket touching PII / logging / retention / encryption / data export / residency.
- Decision Explainer (Sprint 12) writes `why.md` for every Class C+ merge.
- PR body must include: spec anchors, test evidence, security audit notes, MEMORY.md/PROGRESS.md update confirmation,
  ADR links.

### 1.5 Bug & Incident Workflow

- **Bug ticket** → Drizzle migration if schema, Zod if API, **E2E test reproducing the bug FIRST**, then fix.
- **P0 incident** (SLO breach, security exploit, data corruption) → Incident Commander (Sprint 9) opens ticket,
  identifies likely commits via GraphRAG, spawns Precision-mode session.
- **State-Space Replay** (Sprint 14): every LLM call has a ReplayFrame; `/aria replay <session-id>` reproduces in
  isolated Replay Sandbox.
- **Hotfix branch:** `hotfix/<incident-id>-<short>`; PR title `[HOTFIX] …`; squash-merge to `main` + cherry-pick
  to active sprint branch.

### 1.6 Token-Optimisation Rules

- All LLM calls route through Token Gateway (Sprint 5). Direct provider calls fail CI lint.
- Concept Graph distillation (Sprint 8) replaces raw file injection; target ≥5× compression.
- Needle-Threading: task-core → distilled context → critical instructions (DESIGN, security, CORE_VALUES) at END.
- Context Pre-Flight Estimator computes token cost before each call; block if `reserved > session_budget`.
- Session budgets: warn at 80%, hard-stop new remote calls at 95%.
- `MEMORY.md` rule: check `§B` before reading any file; update `§B` after.

### 1.7 Observability Standards

- Winston (TS) + Logback (Java) → structured JSON logs with `session_id`, `agent_id`, `request_id`.
- Prometheus `/metrics` on middleware and backend.
- OpenTelemetry traces (Sprint 9) with OTLP exporter to local Tempo/Jaeger and (env-flagged) Datadog/Sentry.
- SLOs declared in `.entiresystem/slos.yml` (Sprint 9): per-service error rate, p95/p99 latency, deploy correlation.

### 1.8 Git Standards

- Branch: `feat/sprint-N-<short>`, `fix/<scope>-<short>`, `hotfix/<incident-id>-<short>`, `docs/<short>`.
- Commit format: `type(scope): description` — types: `feat | fix | chore | test | refactor | docs | security`.
- Never `--no-verify`; never `--no-gpg-sign` unless explicitly requested.
- PR body must use the template in `.github/PULL_REQUEST_TEMPLATE.md` (added Sprint 5).

---

## §2 Phase 0 — Core Foundation  *(Sprint 5)*

### 1. Goal
Close out Phase 0 so every later phase has a real, running foundation: dockerised stack, real DB migrations,
Token Gateway routing every LLM call, agent Orchestrator, WebSocket layer, replay frames on every call.

### 2. Spec anchors
§2.1 (Topology), §2.2 (State Stores), §4 (Session Model), §6 (Memory layers), §18H (Token Gateway), §18F (Replay).

### 3. Deliverables
- `docker-compose.yml` (postgres+pgvector, redis, ollama, middleware, backend, web) with healthchecks + volumes.
- `Dockerfile.web`, `Dockerfile.middleware`, `Dockerfile.backend`, `Dockerfile.ollama-init` (model preloader).
- Flyway migrations `V1__init.sql` → `V10__sessions_replay_tokens.sql` mirroring every Drizzle schema.
- `CREATE EXTENSION vector` migration; reserved `embedding vector(768)` column on `concept_nodes` and (future)
  `semantic_chunks`.
- `apps/middleware/src/services/tokenGateway.service.ts` + `routes/llm.routes.ts` + `routes/orchestrator.routes.ts`.
- `apps/middleware/src/ws/` — socket.io server, JWT handshake, rooms.
- `com.aria.orchestrator.*` Java package: `SessionModel`, `SessionMode`, `SessionState`, `OrchestratorService`,
  `OrchestratorController`.
- `apps/web/src/lib/useAriaSocket.ts` hook; sidebar live agent-status indicator.
- All Sprint 4 pages wired to live endpoints (no mock data).
- `scripts/dev-up.sh`, `scripts/dev-down.sh`, `scripts/db-migrate.sh`.
- ADR-0001..ADR-0003.

### 4. Tasks (ordered)
1. Add `docker-compose.yml` (root). Services: `postgres:16-bookworm` with pgvector image (`pgvector/pgvector:pg16`),
   `redis:7-alpine`, `ollama/ollama:latest` (pre-pulls qwen2.5-coder + nomic-embed-text via init container), plus
   `middleware`, `backend`, `web` from the three Dockerfiles. Named volumes for pg-data, ollama-models, redis-data.
   Healthchecks: `pg_isready`, `redis-cli ping`, `curl http://localhost:11434/api/tags`.
2. Write Dockerfiles (Node 20 alpine for web/middleware; eclipse-temurin:21-jdk for backend; multi-stage builds).
3. `scripts/dev-up.sh` runs `generate-keys.sh` if missing, then `docker compose up -d`, then `pnpm db:migrate`.
4. Author Flyway migrations under `apps/backend/src/main/resources/db/migration/`. Order:
   - `V1__init.sql` extensions (`uuid-ossp`, `vector`).
   - `V2__users.sql`, `V3__refresh_tokens.sql`, `V4__workspaces_projects.sql`, `V5__sessions.sql`,
     `V6__tickets.sql`, `V7__skills.sql`, `V8__ideas.sql`, `V9__analysis_jobs.sql`,
     `V10__concept_nodes_edges.sql` (vector(768) column reserved).
5. Cross-verify Drizzle schemas in `packages/db/src/schema/*` against the SQL; emit drizzle-kit migrations to the same DB
   (so Drizzle reads tables Flyway owns). Pick **Flyway as source of truth**; Drizzle pulls via `drizzle-kit pull`.
6. Build `tokenGateway.service.ts`:
   - Capacity Registry (in-memory; loaded from `.aria/capacity.yml` if present, defaults otherwise).
   - Priority queue with five buckets (p0_critical → speculative).
   - Rolling 60-second token window per backend.
   - Backpressure at queue depth 50.
   - Backend dispatch: HTTP to Ollama; HTTP to Anthropic gated behind `ANTHROPIC_ENABLED`.
   - Writes a `replay_frames` row before every dispatch (table created in migration `V11__replay_frames.sql`).
   - Exposes: `reserve(req)`, `release(req)`, `consume(req, actualTokens)`, `getQueueStatus()`.
7. Mount `routes/llm.routes.ts`: `POST /api/llm/invoke`, `GET /api/llm/queue/status` (auth required; rate-limited).
8. Java Orchestrator package:
   - `SessionModel` JPA entity (id UUID, projectId, scope JSONB, environment enum, budget BIGINT, mode enum,
     state enum, createdAt, updatedAt).
   - `SessionMode` enum (PLAN_ONLY, APPLY, PRECISION, THROUGHPUT, DESIGN, EXPERIMENT, MIGRATION, META, R_AND_D).
   - `SessionState` enum (NEW, PLANNING, ACTIVE, PAUSED, COMPLETED, ERRORED).
   - `OrchestratorService` — start/stop/pause/budget/status; calls Token Gateway HTTP `/api/llm/invoke`.
   - `OrchestratorController` — REST `/api/sessions/{id}/start|stop|pause|status` with `@PreAuthorize` ownership.
9. Mount `apps/middleware/src/routes/orchestrator.routes.ts` proxying to Java backend.
10. Build WebSocket layer:
    - `apps/middleware/src/ws/index.ts` initialises socket.io on the same HTTP server.
    - JWT verification on `connection` handshake (RS256, same key infra as REST).
    - Rooms: `session:<id>`, `agent:<id>`, `system:health`. Subscribe permissions checked against userId.
    - Server emits `session.update`, `agent.status`, `token.warn`, `token.hard_stop`, `replay.captured`.
11. Web hook `apps/web/src/lib/useAriaSocket.ts` (auto-reconnect, typed event subscriber).
12. Sidebar live-status indicator component in `apps/web/src/components/SessionStatus.tsx`.
13. Wire Sprint 4 pages to live middleware endpoints; verify empty states are real (no mock arrays).
14. Add `pnpm db:migrate` script wrapping Flyway via Maven goal; add `pnpm dev:reset` to drop+migrate.
15. Author E2E specs `sprint5-token-gateway.spec.ts`, `sprint5-orchestrator.spec.ts`, `sprint5-websocket.spec.ts`.
16. Write ADR-0001 (pgvector vs Qdrant), ADR-0002 (socket.io vs native ws), ADR-0003 (Token Gateway in middleware).
17. Update `MEMORY.md §B` for every touched file; update `PROGRESS.md`.

### 5. Schema / contract additions
```sql
-- V1__init.sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- V5__sessions.sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  project_id UUID REFERENCES projects(id),
  scope JSONB NOT NULL DEFAULT '{}',
  environment TEXT NOT NULL CHECK (environment IN ('dev','staging','production','sandbox')),
  budget_tokens BIGINT NOT NULL DEFAULT 0,
  mode TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'NEW',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- V10__concept_nodes_edges.sql (reserve embedding column for Sprint 8)
ALTER TABLE concept_nodes ADD COLUMN embedding vector(768);
CREATE INDEX ON concept_nodes USING hnsw (embedding vector_cosine_ops);

-- V11__replay_frames.sql
CREATE TABLE replay_frames (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES sessions(id),
  agent_id TEXT,
  skill_slug TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  model_backend TEXT NOT NULL,
  model_parameters JSONB NOT NULL,
  prompt_hash TEXT NOT NULL,
  prompt_full TEXT NOT NULL,
  context_window_tokens INT NOT NULL,
  system_message TEXT,
  injected_context_refs JSONB,
  response_hash TEXT,
  response_full TEXT,
  response_tokens_used INT,
  outcome_object_ref TEXT,
  error TEXT
);
CREATE INDEX idx_replay_session ON replay_frames(session_id);
CREATE INDEX idx_replay_agent ON replay_frames(agent_id);
CREATE INDEX idx_replay_error ON replay_frames(error) WHERE error IS NOT NULL;
```
OpenAPI: add `/api/llm/invoke`, `/api/llm/queue/status`, `/api/sessions/{id}/{action}`. Commit spec to `openapi.yaml`.

### 6. Security checklist
- WS handshake **must** verify RS256 JWT; reject + close on failure. (Class C, dual approval.)
- `/api/llm/*` rate-limited; per-user concurrency cap.
- IDOR check on every session endpoint (`session.user_id = req.userId`).
- Validate `OLLAMA_BASE_URL` is an internal/private hostname; reject if it resolves to public IPs.
- `ANTHROPIC_API_KEY` only ever read in server-side code; never echoed to clients; redacted in logs.
- ReplayFrame table holds full prompts — encrypt column for prompts containing user PII once Compliance Auditor (S12)
  defines the rules; for now, mark table as restricted access.

### 7. Test plan
- **Unit:** `tokenGateway.service.test.ts` — queue ordering, rolling-window math, reservation diff, backpressure.
- **Unit (Java):** `OrchestratorServiceTest.java` — state transitions, budget gating.
- **Integration:** middleware ↔ Ollama mock (returns deterministic JSON); middleware ↔ Java backend over HTTP.
- **Contract:** `apps/e2e/contract/llm.spec.ts` validates `/api/llm/invoke` against `openapi.yaml`.
- **E2E:** `sprint5-token-gateway.spec.ts` — submit prompt, confirm response + queue metric tick.
  `sprint5-orchestrator.spec.ts` — `/start` → state ACTIVE → `/pause` → `/stop`. `sprint5-websocket.spec.ts` —
  authenticated client receives `session.update`; unauthenticated handshake closed.
- **Visual:** sidebar status indicator baselines added.
- **Bench (deferred):** WS handshake p95 <50ms; LLM invoke overhead p95 <30ms (excluding model time).

### 8. Review & audit
- ADR-0001 pgvector vs Qdrant.
- ADR-0002 socket.io vs native ws.
- ADR-0003 Token Gateway in middleware vs backend.
- Compliance Auditor not yet active (Sprint 12) — no PII paths touched yet.
- Dual-agent approval: Security on Token Gateway implementation; Domain Specialist (Java) on Orchestrator.

### 9. Definition of Done
- [ ] `pnpm dev:reset && pnpm dev` brings the full stack up; health endpoints respond.
- [ ] Flyway migrates from V1 → V11 on clean Postgres.
- [ ] `POST /api/llm/invoke` returns Ollama response and writes a ReplayFrame row.
- [ ] `POST /api/sessions/{id}/start` transitions state and emits `session.update` on WS.
- [ ] All Sprint 4 pages render live data; empty states empty when DB empty.
- [ ] All Sprint 5 E2E specs green on all three viewports.
- [ ] ADRs committed; MEMORY.md + PROGRESS.md updated; PR merged.

---

## §3 Phase 1 — Safety & Quality  *(Sprint 6)*

### 1. Goal
Make every action that touches user-influenced content safe, and every artifact pass quality gates before merge.

### 2. Spec anchors
§12 (Security/FIM/Sanitization), §13 (QA/Red Team/IP scanner), §14 (Anti-Slop, Turn-1 Discovery).

### 3. Deliverables
- `services/sanitizer.service.ts` two-stage prompt injection detector.
- `services/fim.service.ts` — file integrity monitor.
- `services/redTeam.service.ts` — pre-merge adversarial fuzzers.
- `services/plagiarism.service.ts` — IP/plagiarism scanner.
- `tools/anti-slop-gate.ts`, `tools/anti-test-dodging.ts` — CI linters.
- `routes/ui-discovery.routes.ts` + web page for Turn-1 Discovery Form.
- Playwright config extended for device matrix.
- `.github/workflows/ci.yml` adds Anti-Slop, Anti-Test-Dodging, P0 linter, IP scan steps.

### 4. Tasks
1. Sanitizer: structural strip (DOMPurify-equivalent for HTML, shell-meta strip for plain strings) → call local Ollama
   classifier (small model) for injection score. Thresholds: <0.70 admit (with `trustLabel: 'untrusted-cleared'`),
   0.70–0.89 quarantine (HITL via `/api/quarantine`), ≥0.90 auto-reject. Rate-limited quarantine flip: >20/hour →
   policy lock for 1 hour.
2. FIM: track SHA-256 of SKILL.md, DESIGN.md, DOMAIN_BOUNDARIES.json, CORE_VALUES.yml (once they exist — for now,
   tracks itself + `CLAUDE.md` + `PROGRESS.md`). Hash registry in `.aria/fim_registry.json` signed with daemon Ed25519
   key (created here; full agent keypairs Sprint 12). Mismatch without signed change → `CONFIG_DRIFT_ALERT` event +
   policy lock.
3. Red Team Saboteur: pre-merge runner triggered by GitHub Action on PR. Generates adversarial inputs for changed
   routes: SQLi (sqlmap-style payloads), XSS (OWASP cheatsheet), CSRF (missing token detection), IDOR (sibling-user
   probe), mass-assignment (extra-field injection). Findings serialised to PR comment + `apps/e2e/red-team/findings/`.
4. IP/Plagiarism Scanner: compute sha256 + 5-gram fingerprints of new code; compare against internal codebase corpus
   and curated OSS index (built locally from common-license repos). Permissive license match → require attribution
   comment. Copyleft match → Legal Kill-Switch (hard-delete from branch; redact in logs; clear agent memory).
5. Anti-Slop Gate: scoring linter across 5 axes (Philosophy, Hierarchy, Execution, Specificity, Restraint). Rule:
   P0 violations (no hierarchy, broken alignment, hardcoded magic, DESIGN.md break) → hard-fail. Run on changed UI
   files.
6. Anti-Test-Dodging linter: AST-walk Vitest + Playwright tests; reject (a) tests with no `expect()`, (b) trivial
   asserts like `expect(true).toBe(true)`, (c) tests that pass regardless of state. Implementation in
   `tools/anti-test-dodging.ts`.
7. Turn-1 Discovery Form: `POST /api/ui-discovery` accepts `{audience, surface, tone, brand_context, constraints,
   success_metrics, ticket_id}`. Stored under `.entiresystem/ui_discovery/<ticket-id>.yml`. Web page at
   `/(dashboard)/ui-discovery/[ticket]`.
8. Extend `apps/e2e/playwright.config.ts` projects: `chromium-desktop`, `chromium-tablet`, `chromium-mobile`.
   Update existing sprint specs to run across all three.
9. CI workflow: jobs `lint`, `typecheck`, `unit`, `integration`, `contract`, `e2e-desktop`, `e2e-tablet`,
   `e2e-mobile`, `red-team`, `anti-slop`, `anti-test-dodging`, `ip-scan`, `coverage`. Required for merge.
10. ADR-0004 sanitizer thresholds; ADR-0005 Anti-Slop axis weights; ADR-0006 FIM signing key custody.

### 5. Schema / contract additions
```sql
-- V12__quarantine.sql
CREATE TABLE quarantine_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  origin TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  injection_score NUMERIC(4,3) NOT NULL,
  trust_label TEXT NOT NULL,
  human_decision TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- V13__fim_registry.sql (mirror of file-side registry, for queries)
CREATE TABLE fim_registry (
  path TEXT PRIMARY KEY,
  hash CHAR(64) NOT NULL,
  signed_by TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 6. Security checklist
- Sanitizer is **invoked on every untrusted ingress** (GitHub webhook bodies, RSS items, model outputs that will be
  re-prompted, user-uploaded files). Bypass = CI fail (`grep -r '// @sanitizer-bypass'` blocked).
- FIM registry signed with daemon Ed25519 private key; public key in `.entiresystem/keys/daemon.pub`.
- Red Team findings classified critical/high → block merge.
- IP scan results stored in PR; copyleft hit triggers Legal Kill-Switch immediately.
- Class C (dual approval) on sanitizer thresholds and FIM key custody.

### 7. Test plan
- **Unit:** sanitizer threshold edge cases; FIM hash + signature verify; Red Team payload generator (deterministic
  seeds for tests); IP scanner n-gram math.
- **Integration:** GitHub webhook end-to-end with sanitizer in path; FIM watcher detects edit and emits event.
- **E2E:** `sprint6-sanitizer.spec.ts`, `sprint6-fim.spec.ts`, `sprint6-redteam.spec.ts`, `sprint6-plagiarism.spec.ts`,
  `sprint6-ui-discovery.spec.ts`.
- **Red Team self-test:** seed bad code into a feature branch, confirm linter catches it.

### 8. Review & audit
- ADR-0004 sanitizer thresholds (citing OWASP LLM01).
- ADR-0005 Anti-Slop axis weights.
- ADR-0006 FIM signing key custody.
- Compliance Auditor still inactive (Sprint 12). Legal Kill-Switch wired but limited to local sandbox/staging.

### 9. Definition of Done
- [ ] Sanitizer integrated into every untrusted ingress; tests prove score thresholds.
- [ ] FIM detects edits to tracked files; signed updates pass; unsigned mismatch fails.
- [ ] Red Team workflow runs on PR; critical/high blocks merge.
- [ ] IP scanner runs on PR; copyleft triggers Legal Kill-Switch.
- [ ] Anti-Slop + Anti-Test-Dodging linters block bad inputs.
- [ ] Playwright runs all sprint specs on 3 viewports.
- [ ] CI workflow updated; required checks set.
- [ ] All Sprint 6 E2E specs green; ADRs committed; MEMORY.md + PROGRESS.md updated.

---

## §4 Phase 2 — Experience & Memory  *(Sprint 7)*

### 1. Goal
Create the canonical `.entiresystem/` brain, per-skill experience profiles, EXPERIENCE.md / ANTI_PATTERNS.md per persona,
Shadow Learning Git hook, `/model-transfer` zero-token tool. Backfill ADRs for Sprints 1–4.

### 2. Spec anchors
§2.2 (State Stores), §6 (Memory layers), §9 (Skill Experience Profile).

### 3. Deliverables
- `.entiresystem/` directory with:
  - `README.md` (purpose, file conventions).
  - `DESIGN.md` (read-only marker; minimal UI contract derived from current shadcn + Tailwind setup).
  - `DOMAIN_BOUNDARIES.json` (services, ownership, domains).
  - `CORE_VALUES.yml` (Safety > Trust > Long-term growth > Short-term revenue).
  - `SKILL.md` per agent family (stubs with frontmatter + Transparency Card).
  - `ADRs/ADR-0001.md` … `ADR-0006.md` (backfilled from Sprints 5–6 inline ADRs).
  - `EXPERIENCE/EXPERIENCE.md` + `<persona>_EXPERIENCE.md` stubs.
  - `ANTI_PATTERNS/<domain>_ANTI_PATTERNS.md` stubs.
  - `skills/<skill-slug>/experience.yml`.
  - Empty subdirs: `SessionBriefs/`, `MigrationPlaybooks/`, `concept_graphs/`, `golden_dataset/`, `benchmarks/`,
    `meta_evolution/`, `rfc/`, `horizon_rfcs/`, `ui_discovery/`.
- `services/experience.service.ts` (TS) + `com.aria.experience.*` (Java) read/write APIs.
- Shadow Learning GitHub Action.
- `scripts/knowledge-audit.ts` — surface stale or inconsistent experience entries.
- `scripts/model-transfer.ts` — zero-token tool: reads `.entiresystem/`, writes `.backend/<workspace>/` artefacts
  (semantic indexes, prompt templates).
- FIM registry signs all new `.entiresystem/` files immediately on creation.

### 4. Tasks
1. Create `.entiresystem/` directory layout. Add `.gitkeep` to empty subdirs.
2. Write `CORE_VALUES.yml` with the canonical ordering; mark file read-only via FIM.
3. Write `DESIGN.md` capturing current Tailwind palette, type scale, spacing tokens, component primitives. Mark
   read-only via FIM.
4. Write `DOMAIN_BOUNDARIES.json` listing services (web / middleware / backend / packages) with owners and exposed
   APIs.
5. Author SKILL.md frontmatter + Transparency Card for: backend-api-specialist, frontend-web-specialist,
   db-specialist, devops-engineer, qa-e2e, security-engineer, compliance-auditor, finops-oracle, historian,
   ux-defender, integration-engineer, knowledge-graph-architect.
6. Move/recreate Sprints 5–6 ADRs into `.entiresystem/ADRs/`.
7. `experience.service.ts`: read/write `experience.yml` per skill (best_practices, anti_patterns, failure_stories,
   veracity tag).
8. Shadow Learning GitHub Action: on `pull_request: closed` (merged), diff the change → extract patterns via local
   Ollama → open a PR proposing EXPERIENCE.md updates.
9. `scripts/knowledge-audit.ts` CLI: detect stale entries (file SHA changed but experience untouched), orphaned
   entries (skill removed but experience persists).
10. `scripts/model-transfer.ts`: walks `.entiresystem/`, emits `.backend/<workspace>/` directory with optimised
    indices and prompt headers. Pure Node, NO LLM calls.
11. FIM watches `.entiresystem/` files and signs new ones on first commit.

### 5. Schema / contract additions
None DB-side. Filesystem additions only.

### 6. Security checklist
- `CORE_VALUES.yml` + `DESIGN.md` marked read-only in FIM; any unsigned edit → CONFIG_DRIFT_ALERT.
- `.entiresystem/` is git-tracked; never written to from automation without an attached signed change-record.
- `/model-transfer` writes to `.backend/` only (git-ignored), never `.entiresystem/`.

### 7. Test plan
- **Unit:** experience service YAML round-trip; knowledge-audit detection logic.
- **Integration:** FIM signs new `.entiresystem/` file on commit; unsigned edit triggers alert.
- **E2E:** `sprint7-experience.spec.ts` (Shadow Learning workflow on a test PR), `sprint7-model-transfer.spec.ts`.

### 8. Review & audit
- ADR-0007 .entiresystem/ canonical store layout.
- ADR-0008 Veracity scoring rules (human-authored / human-approved / AI-only).

### 9. Definition of Done
- [ ] `.entiresystem/` exists with all required files; FIM has them signed.
- [ ] All 12 SKILL.md stubs committed with Transparency Card.
- [ ] EXPERIENCE.md + per-persona files exist.
- [ ] Shadow Learning Action runs on PR merge in a test branch and opens a follow-up PR.
- [ ] `pnpm knowledge-audit` runs clean.
- [ ] `pnpm model-transfer` produces a `.backend/` workspace without calling any LLM.
- [ ] Sprint 7 E2E green; ADRs committed.

---

## §5 Phase 3 — Advanced Retrieval (Concept Graph + Distillation)  *(Sprint 8)*

### 1. Goal
Replace raw file injection with 4-level Concept Graph + Context Distillation Engine, achieving ≥5× token compression
on a representative corpus.

### 2. Spec anchors
§6 (Memory), §18N (Advanced RAG + Distillation), §7 (Context Management).

### 3. Deliverables
- Java `com.aria.graph` package: `SemanticChunker`, `ConceptGraphBuilder` (4 levels), `DistillationEngine`.
- Middleware `services/distill.service.ts` calling Java distill endpoint.
- pgvector indexes on Level 1 + Level 3 embeddings (HNSW).
- Background process / scheduled job that rebuilds graph on git push.
- `/knowledge-review` CLI in `scripts/knowledge-review.ts`.
- Token Pre-Flight Estimator integration in Token Gateway (uses `compression_ratio` to estimate cost).
- Web page `/(dashboard)/projects/[id]/graph` extended with all 4 levels.

### 4. Tasks
1. Add tree-sitter language bindings (TS/JS/Java/Python) and a markdown parser.
2. `SemanticChunker.java`: emit `semantic_chunk` records with `chunk_type`, `symbol_name`, `line_range`,
   `dependencies`, `dependents`, `summary` (call Ollama `qwen2.5-coder` for summary), `embedding` (call Ollama
   `nomic-embed-text` for vector).
3. Persist chunks in `semantic_chunks` table; backfill `concept_nodes.embedding`.
4. `ConceptGraphBuilder`: assemble Level 1 (symbols), Level 2 (modules/services), Level 3 (domains), Level 4 (decisions
   linked to ADRs). Persist edges in `concept_edges`.
5. `DistillationEngine`: intent extraction (local Ollama small model) → multi-level traversal (BFS bounded by
   relevance) → ranking → distilled payload assembly with Needle-Threading.
6. `distill.service.ts` exposes `POST /api/distill` taking `{taskDescription, agentId, sessionId}` returning
   `distilled_context_payload`.
7. Token Gateway uses `compression_ratio` from each distill call to feed Pre-Flight Estimator; blocks calls projected
   over budget.
8. `/knowledge-review` script: scan for stale summaries (file SHA changed, summary not), orphaned nodes (symbol gone),
   broken edges, low-quality summaries (heuristic length/keyword).
9. Web `/(dashboard)/projects/[id]/graph` adds level switcher; uses React Flow with custom node renderers per level.
10. ADR-0009 chunking strategy; ADR-0010 distillation ranking weights.

### 5. Schema / contract additions
```sql
-- V14__semantic_chunks.sql
CREATE TABLE semantic_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_file TEXT NOT NULL,
  source_language TEXT NOT NULL,
  chunk_type TEXT NOT NULL,
  symbol_name TEXT,
  line_start INT,
  line_end INT,
  dependencies JSONB,
  dependents JSONB,
  summary TEXT,
  embedding vector(768),
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version_hash CHAR(64) NOT NULL
);
CREATE INDEX idx_chunks_file ON semantic_chunks(source_file);
CREATE INDEX idx_chunks_embedding ON semantic_chunks USING hnsw (embedding vector_cosine_ops);

-- V15__concept_levels.sql
ALTER TABLE concept_nodes ADD COLUMN graph_level INT NOT NULL DEFAULT 1;
ALTER TABLE concept_edges ADD COLUMN graph_level INT NOT NULL DEFAULT 1;
```

### 6. Security checklist
- Chunker reads only repo files inside the workspace; refuses absolute paths outside.
- Distillation output cached but signed with daemon key to prevent tamper-then-reuse.
- Embedding calls go through Token Gateway (counted against compute budget).

### 7. Test plan
- **Unit:** chunker on fixture files; ranking weights; needle-threading assembly order.
- **Integration:** end-to-end distill against a small synthetic corpus; assert compression ratio ≥5×.
- **E2E:** `sprint8-distillation.spec.ts` — submit task → receive payload → graph viz updates.
- **Bench:** compression ratio across 1k-chunk synthetic corpus; p95 distill latency <800ms.

### 8. Review & audit
- ADR-0009 chunking strategy.
- ADR-0010 distillation ranking weights.
- Compliance Auditor flags distillation output if it includes detected PII (rules wired Sprint 12).

### 9. Definition of Done
- [ ] Graph rebuilt incrementally on git push; coverage ≥95% of repo symbols.
- [ ] Distillation compression ratio ≥5× on test corpus.
- [ ] Token Gateway uses Pre-Flight Estimator; over-budget calls rejected.
- [ ] `/knowledge-review` detects synthetic stale/orphan/broken cases.
- [ ] Sprint 8 E2E green; ADRs committed.

---

## §6 Phase 4 — Telemetry & Incidents  *(Sprint 9)*

### 1. Goal
Full observability stack + autonomous Incident Commander + Zero-Downtime Migration Orchestrator + Semantic Tripwires.

### 2. Spec anchors
§17 (Telemetry, Incidents, Migrations).

### 3. Deliverables
- OpenTelemetry SDK in middleware + backend; OTLP exporter to local Tempo/Jaeger.
- `.entiresystem/slos.yml`.
- `com.aria.incident.IncidentCommander` Java service.
- `com.aria.migration.MigrationOrchestrator` + `MigrationPlaybook` YAML schema validator.
- Semantic Tripwire generator (precursor; full Synthetic Data Hydrator Sprint 14).
- Datadog + Sentry MCP stubs (env-flagged).
- Web `(dashboard)/system-health` page.

### 4. Tasks
1. Add OpenTelemetry SDKs and OTLP exporter; default endpoint `http://otel-collector:4317` in compose.
2. Add `otel-collector`, `tempo`, `prometheus`, `grafana` to docker-compose.
3. Author `.entiresystem/slos.yml` with per-service SLOs.
4. Build `IncidentCommander`: listens on Redis stream `system.alerts`; on SLO breach event creates a Precision-mode
   session via Orchestrator; uses Concept Graph (Sprint 8) to identify likely commits; opens Jira ticket via MCP stub.
5. `MigrationOrchestrator`: parses YAML playbook (phases: each with `tests`, `metrics`, `rollback_type`). Runs phases
   in order; halts on failed health gate; refuses auto-down() on `stateful_dangerous` phases after real data flow.
6. Semantic Tripwire generator: inserts known-bad probe records into Synthetic data fixtures (test honeypots) and
   alerts if read.
7. Web `(dashboard)/system-health` page with live SLO panels, alerts feed, recent incidents.

### 5. Schema / contract additions
```sql
-- V16__incidents.sql
CREATE TABLE incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('P0','P1','P2','P3')),
  description TEXT NOT NULL,
  related_commits JSONB,
  jira_ref TEXT,
  session_id UUID REFERENCES sessions(id),
  resolved_at TIMESTAMPTZ
);

-- V17__migrations.sql
CREATE TABLE migration_playbooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  yaml TEXT NOT NULL,
  signed_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE migration_phase_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  playbook_id UUID REFERENCES migration_playbooks(id),
  phase_index INT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  metrics JSONB,
  rollback_executed BOOLEAN DEFAULT false
);
```

### 6. Security checklist
- OTLP exporter destination validated (no public IPs unless `ALLOW_REMOTE_OTLP=true`).
- Migration Orchestrator rejects playbooks with unsigned hash.
- Tripwires never leak into prod data paths.

### 7. Test plan
- **Unit:** SLO evaluator; playbook validator; tripwire detector.
- **Integration:** simulated SLO breach event triggers an incident row + Precision session.
- **E2E:** `sprint9-telemetry.spec.ts`, `sprint9-incident.spec.ts`, `sprint9-migration.spec.ts`.

### 8. Review & audit
- ADR-0011 SLO targets; ADR-0012 migration playbook schema; ADR-0013 Tripwire data isolation.

### 9. Definition of Done
- [ ] Traces visible in Tempo; metrics in Prometheus; logs structured.
- [ ] Simulated SLO breach opens incident + session + Jira (MCP stub).
- [ ] Playbook runner refuses unsafe down() on stateful phase.
- [ ] System-health page live.

---

## §7 Phase 5 — Fleet & Speculation  *(Sprint 10)*

### 1. Goal
Pub/Sub mesh for cross-repo epics; Pre-Cog speculative execution on ticket changes; Agentic Deadlock Breaker that
auto-forces V1 contracts when producers/consumers deadlock.

### 2. Spec anchors
§17.4 (Fleet Commander, healing guardrail), §18I (Deadlock Breaker), §8 (Sandboxes / Speculation).

### 3. Deliverables
- Redis Streams pub/sub mesh with signed envelopes; topics `aria-fleet.<epic-id>.*`.
- `FleetCommanderService` (Java) tracking `CONTRACT_DRAFTED → SCHEMA_UPDATED → CLIENT_IMPLEMENTATION_READY →
  CONTRACT_TEST_RESULTS`.
- Healing cascade guardrail (DFS over agent dependency graph; circuit breaker on cycles).
- Pre-Cog Speculative Execution worker (Jira webhook → `aria-shadow/<ticket-id>` branch).
- Deadlock Breaker (heartbeat every 30s; force V1 contract on 3-minute deadlock).
- Agent registry + Ed25519 keypair generation (mini back-port from Sprint 12 — just keypair issuance, full audit chain
  remains Sprint 12).

### 4. Tasks
1. Add Redis Streams client to middleware + backend.
2. Envelope schema: `{ topic, payload, agent_id, timestamp, signature }`. Verify Ed25519 sig on consume.
3. `FleetCommanderService`: aggregator that emits `FleetOutcome` rows.
4. Healing guardrail: track open agent-to-agent wait edges; DFS cycle detection; on cycle → `FLEET_HEALING_CIRCUIT_
   BREAKER` event + freeze affected agents pending human.
5. Pre-Cog worker: Jira webhook spawns shadow branch with speculative work; reverts if ticket re-prioritised.
6. Deadlock Breaker: heartbeats from each agent (HTTP POST every 30s); build wait graph; on deadlock detected for ≥3
   minutes → force producer to draft V1 contract + force consumers to accept; ContractDebt row recorded.
7. Agent keypair issuance: on registry insert, generate Ed25519, store private key in OS keychain
   (libsecret on Linux containers; production deploy uses HashiCorp Vault MCP — Sprint 15).
8. ADR-0014 fleet envelope format; ADR-0015 deadlock timeout choice.

### 5. Schema / contract additions
```sql
-- V18__fleet.sql
CREATE TABLE fleet_outcomes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  epic_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  payload JSONB NOT NULL,
  signed_by TEXT NOT NULL,
  signature TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE contract_debts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES sessions(id),
  producer_agent TEXT,
  consumer_agents JSONB,
  draft_contract_ref TEXT,
  reconciled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE agent_registry (
  agent_id TEXT PRIMARY KEY,
  agent_family TEXT NOT NULL,
  ed25519_pubkey TEXT NOT NULL,
  status TEXT NOT NULL,
  trust_score NUMERIC(4,3) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 6. Security checklist
- Envelope signatures REQUIRED; reject unsigned.
- Pre-Cog branches isolated to `aria-shadow/*`; never merged automatically.
- Deadlock Breaker actions logged + replayed via ReplayFrame.

### 7. Test plan
- **Unit:** envelope sig verify; cycle detector; heartbeat aggregator.
- **Integration:** simulated multi-agent deadlock; observe forced V1 draft.
- **E2E:** `sprint10-fleet.spec.ts`, `sprint10-deadlock.spec.ts`.

### 8. Review & audit
- ADR-0014 envelope format; ADR-0015 deadlock timeout.

### 9. Definition of Done
- [ ] Two agents on different topics receive each other's signed messages.
- [ ] Synthetic cycle trips the circuit breaker; freeze + alert.
- [ ] Synthetic deadlock auto-resolves with V1 contract + debt row.
- [ ] Sprint 10 E2E green.

---

## §8 Phase 6 — IDE / LSP Integration  *(Sprint 11)*

### 1. Goal
Real ARIA presence in the editor: ghost-text diffs, inline diagnostics, cursor-aware context, inline task dispatch.

### 2. Spec anchors
§18M (Deep Native IDE/LSP Integration).

### 3. Deliverables
- `apps/lsp-server/` new package (TypeScript LSP server on ws transport).
- `extensions/vscode-aria/` (VS Code extension, .vsix locally, marketplace later).
- LSP protocol additions for ghost-text diff overlay, inline task dispatch.
- Concept Graph hover provider (Level 1 + Level 4 summaries).
- File lock indicator via Redis-backed lock with TTL.
- Autonomous Rebase Loop GitHub Action.

### 4. Tasks
1. LSP server skeleton (vscode-languageserver-node).
2. Hook into Concept Graph for hover: `hover(symbol) → Level 1 def + Level 4 governing ADRs`.
3. Ghost-text diff: agent draft → LSP edits with `experimental/aria-ghost-diff` capability; accept/reject keystroke
   tracked.
4. Inline diagnostics: rubric / ANTI_PATTERNS / DESIGN / security findings as severity-tagged diagnostics.
5. Inline task dispatch via code lens: `/fix`, `/test`, `/explain`, `/red-team`, `/compliance`, `/design-check`.
6. File lock: Redis SET NX EX (TTL 60s) per `path → agent_id`; LSP shows decorator if locked.
7. VS Code extension: WS connection to middleware, status bar entry, command palette commands.
8. Autonomous Rebase Loop: GitHub Action that auto-rebases ARIA-authored PRs on lockfile/formatting conflicts only.
9. Perf budgets enforced via benchmark spec: hover <100ms, completion <500ms, diagnostics <1s.

### 5. Schema / contract additions
```sql
-- V19__file_locks.sql
CREATE TABLE file_locks (
  path TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ttl_seconds INT NOT NULL DEFAULT 60
);
```
(Redis is canonical; this table mirrors for audit.)

### 6. Security checklist
- LSP server local-only by default; no remote code execution from the editor.
- Cursor-aware context never sends raw file content to remote model unless user explicitly invokes a remote skill.
- Inline `/red-team` confined to sandbox.

### 7. Test plan
- **Unit:** LSP capability negotiation; ghost-diff serialization.
- **Integration:** VS Code extension talks to middleware in compose; hover/completion/diagnostics flows.
- **E2E:** `sprint11-lsp.spec.ts` headless Code instance; scripted hover & accept-ghost-diff.

### 8. Review & audit
- ADR-0016 LSP protocol extensions; ADR-0017 file lock TTL.

### 9. Definition of Done
- [ ] Hover panel shows Concept Graph data within 100ms.
- [ ] Accept/reject ghost-diff updates the file.
- [ ] Diagnostics show severity-tagged findings.
- [ ] File lock prevents concurrent agent edits.

---

## §9 Phase 7 — Governance & Legal  *(Sprint 12)*

### 1. Goal
Cryptographic agent identity, full Compliance Auditor gate, legal contract reader, GDPR redaction, decision explainer,
audit export.

### 2. Spec anchors
§12 (Security/Privacy/FIM), §13.7 (Legal/Compliance), §20 (Decision Explainer / Auditability).

### 3. Deliverables
- Per-agent Ed25519 keypair fully integrated (every action signed; verify on consume).
- `ComplianceAuditorService` — triggers on PII/logging/retention/encryption/data-export edges.
- `LegalContractReaderService` — PDF→text→embeddings; flags GPL/copyleft on dependency adds.
- GDPR redaction-aware attestation pipeline.
- `/aria explain <session-id>` Decision Explainer CLI + endpoint.
- `/aria export-audit-trail` signed-bundle exporter.
- Transparency Card now mandatory in every SKILL.md (validator from Sprint 16 back-ported).

### 4. Tasks
1. Replace daemon-only keypair with per-agent keypair issuance at registry insert (Sprint 10 stub completed).
2. All Pub/Sub envelopes + ReplayFrames + Orchestrator commands now require valid signature; CI lint rejects unsigned
   call sites.
3. Compliance Auditor: subscribes to Concept Graph diff events; if changed domain edges touch
   `gdpr-compliance | retention-policy | encryption-key | data-export` → opens compliance ticket and blocks merge
   until reviewed.
4. Legal/Contract Reader: ingest PDFs into `contracts` table; vectorise; flag dependencies licensed under copyleft.
5. GDPR redaction: erasure splits content from metadata; replaces PII with `REDACTED` stub; preserves audit hash chain.
6. Decision Explainer: aggregates ReplayFrames + Outcome Objects + ADRs to write `why.md` for a session.
7. Audit export: signed tarball `audit-<date>.tar.zst.age`, encrypted with org key.
8. Backfill Transparency Cards in every SKILL.md.

### 5. Schema / contract additions
```sql
-- V20__compliance.sql
CREATE TABLE compliance_findings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trigger_event TEXT NOT NULL,
  severity TEXT NOT NULL,
  description TEXT NOT NULL,
  ticket_ref TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor TEXT NOT NULL,
  title TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  embedding vector(768),
  signed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 6. Security checklist
- All actions signed; unsigned action = `SIGNATURE_VIOLATION` event.
- GDPR erasure preserves audit chain hashes.
- Audit export bundle signed + encrypted; key escrow documented in ADR-0019.

### 7. Test plan
- **Unit:** Compliance trigger matcher; redaction stub generator; signature verify.
- **Integration:** simulate PII-touching change → Compliance Auditor blocks PR.
- **E2E:** `sprint12-compliance.spec.ts`, `sprint12-explain.spec.ts`, `sprint12-export-audit.spec.ts`.

### 8. Review & audit
- ADR-0018 agent identity custody; ADR-0019 audit export key escrow; ADR-0020 GDPR redaction algorithm.

### 9. Definition of Done
- [ ] Every action signed; CI rejects unsigned call sites.
- [ ] Compliance Auditor opens findings on simulated PII change.
- [ ] `/aria explain` produces a why.md from a real session.
- [ ] `/aria export-audit-trail` produces a verified signed bundle.

---

## §10 Phase 8 — Finance & Procurement  *(Sprint 13)*

### 1. Goal
FinOps Oracle predictive gate; token reservation for parallel fan-out; vendor procurement workflow; Treasury stub;
Infrastructure Arbitrage Engine.

### 2. Spec anchors
§11 (FinOps + Procurement), §17.6 (Infra Arbitrage).

### 3. Deliverables
- `FinOpsOracleService` — pre-flight cost estimation gate at `/startwork`.
- Token reservation model integrated with Token Gateway (Sprint 5).
- `ProcurementScoutService` — vendor comparison + RFQ generator.
- `CorporateTreasuryService` — Stripe Issuing stub.
- `DiplomatAgentService` — playbook-driven B2B negotiation.
- `InfrastructureArbitrageService` — multi-cloud pricing monitor (local stub).

### 4. Tasks
1. Cost estimation models in `services/finops.service.ts` (tokens × pricing + compute × pricing + storage + 3rd-party).
2. `/startwork` calls FinOps; insufficient budget → reject with reason.
3. Token reservation: Token Gateway pre-reserves estimated tokens before parallel calls; releases diff after.
4. Procurement Scout: vendor metadata table; comparison report generator (markdown + structured YAML).
5. Treasury stub: virtual card model in DB; Stripe Issuing MCP-shaped function (real wiring deferred).
6. Diplomat playbook engine (YAML workflows: kickoff → counter → closing).
7. Arbitrage Engine: scrape (local) cloud price sheets; propose multi-cloud migration playbooks.

### 5. Schema / contract additions
```sql
-- V21__finance.sql
CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scope TEXT NOT NULL,
  scope_ref UUID,
  tokens_allocated BIGINT NOT NULL,
  tokens_used BIGINT NOT NULL DEFAULT 0,
  tokens_reserved BIGINT NOT NULL DEFAULT 0,
  warn_at NUMERIC(3,2) NOT NULL DEFAULT 0.80,
  hard_stop_at NUMERIC(3,2) NOT NULL DEFAULT 0.95,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  metadata JSONB,
  contracts JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 6. Security checklist
- Vendor data isolated to authenticated procurement role.
- Stripe stub functions log only redacted card refs.

### 7. Test plan
- **Unit:** cost model arithmetic; reservation diff logic.
- **Integration:** start a session with low budget → blocked; with adequate budget → runs.
- **E2E:** `sprint13-finops.spec.ts`, `sprint13-procurement.spec.ts`.

### 8. Review & audit
- ADR-0021 cost model coefficients; ADR-0022 reservation diff strategy.

### 9. Definition of Done
- [ ] FinOps gate blocks low-budget sessions.
- [ ] Token Gateway honours reservations.
- [ ] Procurement Scout produces a vendor comparison report.
- [ ] Arbitrage Engine emits a migration proposal RFC.

---

## §11 Phase 9 — Security Protocol & Benchmarking  *(Sprint 14)*

### 1. Goal
Continuous adversarial testing, synthetic data, deterministic replay, industry benchmarks, Golden Dataset regression.

### 2. Spec anchors
§18E (Red Team vs Blue Team), §18F (Replay), §18G (Synthetic Hydrator), §18L (Benchmarking), §13.5 (Golden Dataset).

### 3. Deliverables
- Chaos Sandbox (Docker-in-Docker isolated net) running every 6h.
- Red Team vs Blue Team scheduler + Ouroboros Gate.
- Synthetic Data Hydrator with profiles (qa, red_team, performance, minimal) and hydration cache.
- Full State-Space Replay Engine (`.aria/replay/replay.db` mirrored from Postgres `replay_frames`).
- `/aria replay <session-id>` CLI in `scripts/aria-replay.ts`.
- SWE-bench Lite CI deploy gate.
- SWE-bench Verified + WebArena weekly cron.
- Internal benchmark suite + Golden Dataset (50+ known-bad cases).

### 4. Tasks
1. Docker-in-Docker Chaos Sandbox; isolated network; resource limits.
2. Red Team scheduler: cron worker (Java `@Scheduled` or Node bullmq) every 6 hours.
3. Blue Team monitoring: Datadog/Sentry equivalents (otel-collector) inside sandbox.
4. Ouroboros Gate: on critical/high finding → Security drafts fix → Red Team re-attacks → escalate if bypass.
5. Synthetic Hydrator: schema-aware faker with FK ordering, edge case injection, PII safety check; profile selection
   by agent type; cache by schema-hash.
6. Replay Engine: SQLite `replay.db` append-only mirror; `/aria replay` rehydrates parameters + prompt and re-runs in
   isolated sandbox; for remote models, "approximate replay" with diff.
7. SWE-bench Lite local subset (100 issues) integrated into CI; deploy gate fails on <100% resolve.
8. SWE-bench Verified + WebArena weekly via GitHub Actions cron.
9. Internal benchmarks per-skill; results in `.entiresystem/benchmarks/<suite>/results/`.
10. Golden Dataset YAML files; weekly Grader regression workflow.

### 5. Schema / contract additions
```sql
-- V22__redteam.sql
CREATE TABLE red_team_findings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  issue_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  description TEXT,
  exploit_path TEXT,
  evidence_artifact_paths JSONB,
  remediated_by_session UUID REFERENCES sessions(id),
  remediated_at TIMESTAMPTZ
);
```

### 6. Security checklist
- Chaos Sandbox network default-deny; only synthetic data; no prod credentials.
- Replay Sandbox is write-isolated; cannot mutate prod state.
- Benchmark sandboxes resource-bounded.

### 7. Test plan
- **Unit:** hydration FK ordering; replay diff math; benchmark scoring.
- **Integration:** seeded vulnerability → Red Team finds it → Blue Team verifies → patch loop closes it.
- **E2E:** `sprint14-chaos.spec.ts`, `sprint14-hydrator.spec.ts`, `sprint14-replay.spec.ts`,
  `sprint14-benchmarks.spec.ts`.

### 8. Review & audit
- ADR-0023 Chaos cadence; ADR-0024 Replay determinism trade-offs; ADR-0025 Golden Dataset curation rules.

### 9. Definition of Done
- [ ] Red Team vs Blue Team cron runs successfully.
- [ ] Hydrator produces valid synthetic data; PII safety check passes.
- [ ] `/aria replay` reproduces a deterministic local-model session exactly.
- [ ] SWE-bench Lite passes 100% in CI before deploy.
- [ ] Golden Dataset passes 100% weekly.

---

## §12 Phase 10 — HR, Kill Switch, Resilience  *(Sprint 15)*

### 1. Goal
Zero-trust identity off-boarding, distributed kill switch, legacy code protection, weekly Seed Vault, recovery drill.

### 2. Spec anchors
§18 (HR, Kill Switch, Chesterton's Fence), §18D (Seed Vault).

### 3. Deliverables
- `ZeroTrustHrEngine` with HRIS MCP stub (Workday/Gusto/BambooHR shapes).
- `Defcon1KillSwitch` — signed UDP broadcast + receiver.
- `HistorianService` — git blame + ADR + Slack ping before destructive refactors.
- `ReaperAgent` — 90-day inactivity dead-code removal (only after Historian clears).
- `WeekendJanitorAgent` — Friday 23:00 tech-debt campaign.
- `SeedVaultService` — weekly tar | age | gpg archive to local cold-storage dir.
- `scripts/seed-vault-restore-drill.sh`.

### 4. Tasks
1. HRIS MCP stub interface (`onTermination(employeeId)` → revoke IdP / SSH / IAM / GitHub / Slack / Jira).
2. Defcon-1: signed UDP broadcast over loopback (multicast in real deploys); each daemon receives, verifies, halts.
3. Historian: hooks pre-merge on deletions > N lines or refactors touching legacy code; sends Slack DM (MCP stub) to
   blame-author; default-archives behind feature flag if no response in 48–72h.
4. Reaper: queries last access time per file/symbol; flags 90-day inactive; runs only after Historian green-light.
5. Weekend Janitor: cron Fri 23:00 local; runs lint + dep updates + dead-code sweep.
6. Seed Vault: weekly archive of code repos + `.entiresystem/` + Ollama weights + Orchestrator config to
   `~/.aria/seed-vault/<iso-date>.tar.zst.age`; secrets excluded.
7. Recovery drill: `seed-vault-restore-drill.sh` extracts most recent vault into temp dir, runs `pnpm dev:reset`
   against fresh DB, asserts services come up.

### 5. Schema / contract additions
```sql
-- V23__hr_events.sql
CREATE TABLE hr_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id TEXT NOT NULL,
  event TEXT NOT NULL,
  detail JSONB,
  acted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 6. Security checklist
- Defcon-1 broadcast signed with Ed25519 + HMAC; require two-person quorum to issue (CEO + CTO MFA in real deploy).
- Seed Vault encrypted; recipient key rotated quarterly.
- Historian uses git blame only; never deletes without flag.

### 7. Test plan
- **Unit:** signature verify on Defcon broadcast; reaper inactivity calc.
- **Integration:** simulated termination event → revocations recorded.
- **E2E:** `sprint15-hr.spec.ts`, `sprint15-defcon.spec.ts`, `sprint15-seed-vault.spec.ts`.

### 8. Review & audit
- ADR-0026 Defcon broadcast format; ADR-0027 Seed Vault retention; ADR-0028 Chesterton wait window.

### 9. Definition of Done
- [ ] Termination revokes simulated accesses.
- [ ] Defcon-1 halts a sandbox daemon.
- [ ] Reaper flags inactive code; Historian guard works.
- [ ] Seed Vault archive created weekly; restore drill passes.

---

## §13 Phase 11 — Skill Ecosystem  *(Sprint 16)*

### 1. Goal
Lazy-loaded skill registry, marketplace acquisition, quarantine before activation, version lifecycle.

### 2. Spec anchors
§9 (Skill ecosystem / Talent / Lazy loading).

### 3. Deliverables
- SKILL.md Zod validator (frontmatter + Transparency Card).
- In-memory Skill Header Index in middleware.
- `TalentAcquisitionService` — Skills Marketplace MCP stub + semantic search.
- `SkillQuarantineService` — sandbox scanner for prompt injection, obfuscation, credential theft, post-install hooks,
  arbitrary code, unwarranted network.
- Skill version tracking + `skill_installs.yml`.

### 4. Tasks
1. Zod validator for SKILL.md frontmatter (name, description, trigger_keywords, risk_class, domains, source, version)
   and Transparency Card.
2. Header Index loaded at boot; full SKILL.md body loaded lazily on first invocation.
3. Trigger keyword + domain + risk-class matching in Orchestrator routing.
4. Talent Acquisition: Marketplace MCP stub; semantic search via Concept Graph embeddings; ranking by
   popularity/recency/domain-fit.
5. Skill Quarantine: sandboxed eval of skill against test prompts; threat detectors run; outcomes
   cleared / dev-only / hard-blocked.
6. Skill install log in `.entiresystem/skills/skill_installs.yml` (immutable append).
7. Update lifecycle: version bump only via Meta-Evolution (Sprint 17) or human PR.

### 5. Schema / contract additions
```sql
-- V24__skills.sql
CREATE TABLE skill_registry (
  skill_id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  version TEXT NOT NULL,
  source TEXT NOT NULL,
  risk_class TEXT NOT NULL,
  frontmatter_hash CHAR(64) NOT NULL,
  body_hash CHAR(64) NOT NULL,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 6. Security checklist
- All Marketplace fetches run through sanitizer (Sprint 6).
- High-risk threats hard-blocked; require Security + CTO override.
- Skill install log immutable.

### 7. Test plan
- **Unit:** validator edge cases; ranking ties; threat detectors.
- **Integration:** install a synthetic skill from a local Marketplace mock; quarantine path.
- **E2E:** `sprint16-skill-ecosystem.spec.ts`, `sprint16-quarantine.spec.ts`.

### 8. Review & audit
- ADR-0029 Skill risk-class taxonomy; ADR-0030 Quarantine threat catalog.

### 9. Definition of Done
- [ ] All SKILL.md files pass validator.
- [ ] Lazy loading observed (memory profile shows headers only).
- [ ] Quarantine blocks a known-bad synthetic skill; cleared a known-good one.

---

## §14 Phase 12 — Growth, Strategy, Meta-Evolution  *(Sprint 17)*

### 1. Goal
Autonomous improvement: Synthesizer mines telemetry, Exec Board decides, Supreme Court arbitrates, Meta-Evolution
rewrites SKILL.md files behind the Golden Dataset gate, trust scoring enables auto-merge.

### 2. Spec anchors
§19 (Growth/Strategy/Ideology), §18A (Meta-Evolution Architect), §18C (Human Friction Auditor).

### 3. Deliverables
- `SynthesizerService` — weekly mine APM + support + Slack (stubs); RFCs in `.entiresystem/rfc/`.
- AI Executive Board (Product Architect + Tech Lead + FinOps Oracle) two-round consensus.
- ARIA Proposals Jira board MCP stub.
- `SupremeCourtService` — deterministic CORE_VALUES weighted voting.
- `GrowthExperimentOrchestrator` — feature flags + A/B variants + winner detection.
- Auto-Merge Trust Scoring (per skill × per risk class).
- `MetaEvolutionArchitect` (Ouroboros Engine).
- Curriculum Planner / Misalignment Monitor / System Health Analyst / Human Friction Auditor (observation-only).

### 4. Tasks
1. Synthesizer: weekly cron mines stub data; drafts RFC YAML.
2. Exec Board: round-robin two-round refinement; on consensus, emits Jira ticket via MCP stub.
3. Supreme Court: deterministic weighted vote over CORE_VALUES priorities; records ADR.
4. Growth Experiment: feature flags (Unleash open-source self-hosted in compose), variant assignment, winner via
   stats test (e.g., Bayesian).
5. Trust scoring: per skill × per risk class table; updated on PR merge / revert; threshold ≥0.95 enables Class B
   auto-merge for that skill.
6. Meta-Evolution flow: analyse → diagnose → draft → meta-test (Meta-Sandbox runs Golden Dataset) → deploy
   (with Human Tech Lead approval). Hard-rollback on regression. Cannot alter CORE_VALUES / DESIGN / permissions /
   safety constraints.
7. Curriculum Planner / Misalignment Monitor / System Health Analyst / Human Friction Auditor as read-only collectors
   exposing dashboards (`/system-health` extended).

### 5. Schema / contract additions
```sql
-- V25__governance.sql
CREATE TABLE rfcs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  yaml TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE trust_scores (
  skill_slug TEXT NOT NULL,
  risk_class TEXT NOT NULL,
  score NUMERIC(4,3) NOT NULL,
  approved_count INT NOT NULL DEFAULT 0,
  reverted_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (skill_slug, risk_class)
);
```

### 6. Security checklist
- Meta-Evolution CANNOT touch CORE_VALUES / DESIGN / Transparency Card hard-constraints.
- All Meta-Evolution merges require Human Tech Lead approval.
- Trust scoring drops on revert; cascade-rollback rules enforced.

### 7. Test plan
- **Unit:** weighted-vote determinism; trust math; Meta-Evolution diagnosis output schema.
- **Integration:** seeded high token-burn → Meta-Evolution proposes a rewrite → meta-sandbox passes Golden Dataset →
  PR opened.
- **E2E:** `sprint17-meta-evolution.spec.ts`, `sprint17-supreme-court.spec.ts`, `sprint17-trust-scoring.spec.ts`.

### 8. Review & audit
- ADR-0031 trust-score thresholds; ADR-0032 Meta-Evolution scope (read-only product code).

### 9. Definition of Done
- [ ] Synthetic high-burn SKILL → Meta-Evolution PR with diagnosis + diffs.
- [ ] Supreme Court resolves a constructed conflict deterministically.
- [ ] Trust scoring controls auto-merge eligibility for synthetic skill.

---

## §15 Phase 13 — Horizon Scanner  *(Sprint 18)*

### 1. Goal
Continuous technology-landscape monitoring with stability-gated PoCs and Evolution RFCs.

### 2. Spec anchors
§10 (Horizon Scanner / Hype vs Value / Evolution RFC).

### 3. Deliverables
- Source ingesters: RSS, GitHub Trending, Hacker News, ArXiv, npm/PyPI/Maven changelogs, CVE/NVD.
- Hype-vs-Value 4-axis scoring + thresholds.
- Autonomous PoC executor in R&D Sandbox (clone repo, run migration, capture build time, test pass rate, bundle size,
  security scan).
- Evolution RFC writer + Jira/Slack pitch.
- `/horizon-scan`, `/horizon-status`, `/horizon-rfc list|view|approve|reject` commands.

### 4. Tasks
1. Ingesters with idempotent dedup by signal_id; default Monday 03:00 cron + `/horizon-scan now`.
2. Scoring: each axis 0–3; total bucketed MONITOR / EVALUATE / RECOMMEND / CRITICAL_UPGRADE.
3. R&D Sandbox: clones repo, attempts migration, runs test suite, captures metrics.
4. RFC YAML writer; saves to `.entiresystem/horizon_rfcs/`; opens Jira ticket via MCP stub.
5. CLI handlers in `scripts/horizon.ts`.

### 5. Schema / contract additions
```sql
-- V26__horizon.sql
CREATE TABLE horizon_signals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  technology TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  evidence JSONB,
  relevance TEXT,
  notes TEXT
);

CREATE TABLE horizon_pocs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  signal_id UUID REFERENCES horizon_signals(id),
  result TEXT NOT NULL,
  metrics JSONB,
  recommendation TEXT,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 6. Security checklist
- Source data routed through sanitizer (Sprint 6) before ingestion.
- PoC sandbox network default-deny outside expected hosts.
- Critical CVEs detected → immediate RFC + alert; bypass Monday 03:00 wait.

### 7. Test plan
- **Unit:** scoring; bucket thresholds; dedup.
- **Integration:** fed synthetic signals → PoC runs → RFC YAML produced.
- **E2E:** `sprint18-horizon.spec.ts`.

### 8. Review & audit
- ADR-0033 Scoring rubric; ADR-0034 PoC budget caps.

### 9. Definition of Done
- [ ] All sources ingested; signals deduped.
- [ ] Scoring bucketed correctly.
- [ ] PoC for a test "upgrade Vite" scenario emits an RFC.

---

## §16 Phase 14 — Gradual Autonomy Onboarding  *(Sprint 19)*

### 1. Goal
Implement Shadow Mode → Training Wheels → Graduated Autonomy with tier rollback and trust reset.

### 2. Spec anchors
§18B (Gradual Autonomy Onboarding Protocol).

### 3. Deliverables
- Shadow Mode (Phase 1) read-only enforcement (write tools hard-disabled).
- Shadow Mode Report generator.
- Training Wheels (Phase 2) — auto-merge hard-disabled; trust accumulation.
- Graduated Autonomy (Phase 3) tiers wiring (Class B auto / Class C semi / Class D human).
- Trust degradation + rollback triggers + `/aria trust-reset`.

### 4. Tasks
1. Policy gate in Orchestrator: respect `system.autonomy_phase`; in Shadow, all Class B+ writes blocked.
2. Shadow Mode Report aggregates graph coverage + EXPERIENCE.md state + merge analysis.
3. Training Wheels: every merge requires human approval; trust score updates from Sprint 17 schema.
4. Graduated Autonomy: thresholds enforced from Sprint 17 trust table; revert hooks adjust scores.
5. Rollback triggers (Defcon-1, security incident, 3 reverts/30d, `/aria trust-reset`).

### 5. Schema / contract additions
```sql
-- V27__autonomy.sql
CREATE TABLE autonomy_state (
  scope TEXT PRIMARY KEY,
  phase TEXT NOT NULL,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);
```

### 6. Security checklist
- Shadow Mode blocks every write tool; bypass = security incident.
- Tier promotion requires explicit Tech Lead approval; record in audit.

### 7. Test plan
- **Unit:** policy gate; trust score adjustments.
- **Integration:** synthetic merges and reverts move state through tiers.
- **E2E:** `sprint19-shadow.spec.ts`, `sprint19-trust.spec.ts`.

### 8. Review & audit
- ADR-0035 Tier thresholds; ADR-0036 Rollback triggers.

### 9. Definition of Done
- [ ] System enters Shadow Mode and blocks writes.
- [ ] Promotion to Training Wheels requires approval; promotion to Graduated Autonomy requires trust ≥0.90/0.80.
- [ ] Synthetic reverts cause rollback to Training Wheels.

---

## §17 Phase 15 — Edge Swarm & Predictive Data Gravity  *(Sprint 20)*

### 1. Goal
SLM compilation pipeline + on-device web edge agent; behavioural prediction pre-warming cache.

### 2. Spec anchors
§18J (Edge Swarm), §18K (Predictive Data Gravity).

### 3. Deliverables
- ML Engineer compilation pipeline: pick base SLM, fine-tune, quantise INT4/INT8, compile (Core ML / ONNX / WASM).
- Sandbox Attestation Service (hash + sign binary).
- Web Edge Agent runtime in `apps/web/src/edge-agent/` using Transformers.js.
- Mobile stubs scaffolded only (full apps out of scope).
- `BehavioralPatternAnalyzer` + `PredictionEngine` + `PredictiveHydrationQueue` + `AssetPreGenerator`.
- Redis cache with TTL governance and LRU.

### 4. Tasks
1. Compilation pipeline scripts under `apps/edge-build/`; pick `qwen2.5-1.5b-instruct` as initial SLM.
2. Quantisation to INT8 via `onnxruntime-tools`; size budget enforced (≤50MB web).
3. Sandbox Attestation Service hashes the binary and signs with developer key.
4. Web edge agent loads model in browser; tiny inference endpoint for on-device suggestions.
5. Behavioral Pattern Analyzer: ingests synthetic event stream; emits cohort + per-user predictions.
6. Predictive Hydration Queue: scheduler consumes predictions, requests asset pre-gen, writes to Redis with TTL by
   confidence.
7. Privacy: no PII in cache keys; `/api/predictions/opt-out` endpoint; periodic purge.

### 5. Schema / contract additions
```sql
-- V28__edge_predictions.sql
CREATE TABLE edge_models (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  target TEXT NOT NULL CHECK (target IN ('ios','android','web')),
  base_model TEXT NOT NULL,
  binary_hash CHAR(64) NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  size_bytes BIGINT
);

CREATE TABLE prediction_optouts (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  opted_out_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 6. Security checklist
- Edge agent processes only user's own data on device; no transmission of raw behavioral data.
- Cache keys hashed; no PII.
- Opt-out enforced.

### 7. Test plan
- **Unit:** prediction TTL math; LRU eviction; opt-out filter.
- **Integration:** synthetic events → predictions → cache warm.
- **E2E:** `sprint20-edge.spec.ts` (load model in headless browser; cap time), `sprint20-prediction.spec.ts`.

### 8. Review & audit
- ADR-0037 SLM size budgets; ADR-0038 Predictive cache TTL governance; ADR-0039 Edge privacy stance.

### 9. Definition of Done
- [ ] SLM compiled ≤50MB; loads in browser; inference returns deterministic output for fixed seed.
- [ ] Predictions warm cache; precision/recall metrics computed.
- [ ] Opt-out endpoint hides user predictions immediately.

---

## §18 Phase 16 — Genesis & Omnichannel  *(Sprint 21)*

### 1. Goal
Stand up new products from a single command; enforce Contract-First Omnichannel; analyse missing mobile channels;
enforce Responsive Retrofit.

### 2. Spec anchors
§16 (Genesis Pipeline / Omnichannel).

### 3. Deliverables
- `/genesis-start <idea>` flow (Executive Board PRD + CTO System Design + Orchestrator repo creation).
- Contract-First Omnichannel enforcement (OpenAPI lock before backend/web/mobile sprints start).
- Omnichannel Gap Analyzer (domain graph + analytics scan; missing-mobile RFC).
- Responsive Retrofit Engine (mobile-first DESIGN rules; horizontal-scroll fail).

### 4. Tasks
1. `/genesis-start` CLI in `scripts/genesis.ts` orchestrating the Executive Board + CTO + Orchestrator turn.
2. PRD/System Design templates in `.entiresystem/templates/`.
3. Repo creation via GitHub MCP (create-repo + initial ADR/DESIGN/SKILL stubs + CI/CD scaffolding).
4. Contract-First enforcement: backend/web/mobile sprints check for a signed OpenAPI lock under
   `.entiresystem/contracts/<project>/openapi.yaml`; refuse to start without it.
5. Gap Analyzer: scans `domain_graph.json` and analytics; if web + API exist but no mobile and mobile traffic > T%,
   emits mobile expansion RFC.
6. Responsive Retrofit: Anti-Slop axis specifically for mobile horizontal scroll / overlap; hard-fail in CI.

### 5. Schema / contract additions
```sql
-- V29__genesis.sql
CREATE TABLE genesis_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  idea TEXT NOT NULL,
  prd_ref TEXT,
  design_ref TEXT,
  repos_created JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
```

### 6. Security checklist
- Genesis creates only sandboxed repos until human reviews the System Design.
- Contract-First refusal logs audit event; bypass = security incident.

### 7. Test plan
- **Unit:** PRD template renderer; Gap Analyzer scoring; Retrofit axis rule.
- **Integration:** simulated `/genesis-start` → repos created in test GitHub org (mock).
- **E2E:** `sprint21-genesis.spec.ts`, `sprint21-omnichannel.spec.ts`.

### 8. Review & audit
- ADR-0040 Genesis repo naming; ADR-0041 Contract-First enforcement scope; ADR-0042 Responsive thresholds.

### 9. Definition of Done
- [ ] `/genesis-start <idea>` produces a complete PRD + System Design + scaffolded repos.
- [ ] Contract-First enforced; sprint blocked without locked OpenAPI.
- [ ] Gap Analyzer flags a constructed missing-mobile case.
- [ ] Mobile horizontal-scroll hard-fails CI.

---

## §19 Risk Register (top 20)

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | Spec creep: 17 phases is a multi-quarter program | High | High | Sprint-locked DoD; one phase per sprint; do not start N+1 until N is green |
| 2 | Local-only Ollama lacks capacity for Concept Graph embeddings | Medium | High | Quantised models; lazy embedding; cache embeddings in pgvector; allow Anthropic embeddings as Sprint 8+ feature flag |
| 3 | Postgres + pgvector slows under heavy graph queries | Medium | Medium | HNSW indexes; per-level partitioning; Sprint 8 load test |
| 4 | WebSocket scaling | Low | Medium | Sticky sessions in compose; Redis adapter for Sprint 5+ scaling |
| 5 | Anthropic key absence delays governance flows | Medium | Medium | `ANTHROPIC_ENABLED=false` path runs everything on Ollama with degraded grader quality; switch on grant |
| 6 | Meta-Evolution rewrites a SKILL.md that drops a safety constraint | Low | Critical | Hard rollback on Golden Dataset regression; cannot alter CORE_VALUES / DESIGN; Human Tech Lead approval before merge |
| 7 | Replay engine drifts on remote models | Medium | Medium | Document approximate replay; rely on local seed for deterministic core tests |
| 8 | Synthetic data generates PII by accident | Low | High | PII safety check in Hydrator; CI lint blocks unsafe fixtures |
| 9 | Defcon-1 falsely triggers | Low | Critical | Two-person quorum + MFA in production; staging dry-run |
| 10 | Skill marketplace skill smuggles prompt injection | Medium | High | Quarantine sandbox + threat catalog; high-risk hard-blocked |
| 11 | Token budget under-counted causes hard stops in production | Medium | Medium | Pre-Flight Estimator + rolling-window reconciliation; alerts at 80% |
| 12 | Concept Graph stale | Medium | Medium | `/knowledge-review` cron; coverage <80% triggers rebuild |
| 13 | Seed Vault not tested | Medium | Critical | Quarterly recovery drill in CI |
| 14 | LSP latency budget missed | Medium | Low | Local model hot path; cache hover responses; benchmark gate |
| 15 | Trust scoring promotes too fast | Low | High | Hard thresholds; revert decay; manual reset |
| 16 | GDPR erasure leaves PII in logs | Low | Critical | Content/metadata split + redaction-aware attestation; audit |
| 17 | Compliance Auditor noisy false-positives | Medium | Medium | Tunable rules in `.entiresystem/compliance/rules.yml`; ADR-tracked |
| 18 | Pre-Cog speculation wastes budget | Medium | Low | Speculative priority lowest; auto-discard on ticket re-priority |
| 19 | Edge Swarm leaks proprietary model | Low | High | Compile-only binaries; cryptographic signing; no weight extraction |
| 20 | Single dev cadence vs 17-sprint plan | High | Medium | Surface velocity reality in PROGRESS; cut or merge phases as needed |

## §20 External Integration Matrix

| Integration | Key? | Status | Sprint to wire | Notes |
|---|---|---|---|---|
| Ollama | local | active | Sprint 5 | qwen2.5-coder + nomic-embed-text via init container |
| Anthropic (Claude) | `ANTHROPIC_API_KEY` | not granted | Sprint 5 stub; Sprint 12 enforce | `claude-sonnet-4-6` routine, `claude-opus-4-7` high-stakes |
| Postgres + pgvector | local | active | Sprint 5 | Docker `pgvector/pgvector:pg16` |
| Redis | local | active | Sprint 5 | Streams + lock store |
| GitHub | `GITHUB_CLIENT_ID/SECRET` | active | Sprint 5 wiring | OAuth already done; webhooks Sprint 10 |
| Jira / Linear | MCP | stub | Sprint 9, Sprint 17 | Incident Commander + ARIA Proposals board |
| Slack / Teams | MCP | stub | Sprint 15, Sprint 18 | Historian pings + Horizon pitches |
| HRIS (Workday / Gusto) | MCP | stub | Sprint 15 | Termination webhook |
| Stripe Issuing | MCP | stub | Sprint 13 | Treasury virtual cards |
| Datadog / Sentry | env | stub | Sprint 9 | OTLP exporter local first |
| LaunchDarkly | optional | stub | Sprint 17 | Self-host Unleash by default |
| RSS / HN / ArXiv / CVE | public | active when Sprint 18 lands | Sprint 18 | No keys needed |

## §21 Glossary

- **ARIA** — Autonomous Repository Intelligence Agent (the platform).
- **ADR** — Architecture Decision Record. Lives in `.entiresystem/ADRs/`.
- **Action Class** — A (safe read) / B (bounded auto) / C (dual approval) / D (human only) / E (prohibited). §5 of spec.
- **Anti-Slop Gate** — 5-axis lint preventing low-quality UI artifacts. §14 of spec.
- **Concept Graph** — 4-level (Symbol / Module / Domain / Decision) graph used for distillation. §18N.
- **Distillation Engine** — Replaces raw file injection with relevance-ranked summaries. ≥5× target.
- **DoD** — Definition of Done. Checklist closing every sprint.
- **FIM** — File Integrity Monitor for brain files (SKILL/DESIGN/DOMAIN_BOUNDARIES/CORE_VALUES). §12.
- **Golden Dataset** — 50+ known-bad cases regressed weekly against Grader. §13.
- **Meta-Evolution** — Ouroboros Engine that rewrites SKILL.md/EXPERIENCE.md under Golden gate. §18A.
- **Outcome Object** — Writer-output deliverable evaluated by Grader.
- **Replay Frame** — Append-only record of every LLM call's parameters/prompt/response/hash. §18F.
- **Seed Vault** — Weekly encrypted air-gapped archive for total disaster recovery. §18D.
- **SLM** — Small Language Model compiled to Core ML / ONNX / WASM for on-device inference. §18J.
- **Token Gateway** — Single egress for all LLM calls; queues, paces, reserves, writes ReplayFrames. §18H.
- **Transparency Card** — Mandatory disclosure block in every SKILL.md (optimizes_for, hard_constraints, allowed/forbidden_actions).
