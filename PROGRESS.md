# ARIA-V1 — Progress Log

> This is the Claude Code session handoff file.
> READ THIS at the start of every session to know exactly where we are.
> UPDATE THIS at the end of every session.

---

## Current Sprint: 5 — Token Gateway + Agent Orchestrator + WebSocket Layer
## Status: NOT STARTED
## Last Updated: 2026-05-16
## Last Commit: fix(web): add missing data-testid attrs for sprint4 e2e specs (planning, sessions, team)

---

## ✅ COMPLETED SPRINTS

### Sprint 1 — Auth, Security Baseline, Monorepo Setup
**Branch**: main (merged)
**SPEC**: §12 (Security), §2.2 (State Stores)

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
**Branch**: main (merged)
**SPEC**: §6 (Knowledge/Graph), §15 (Business Logic)

What was built:
- `apps/middleware/src/routes/projects.routes.ts` — CRUD routes
- `apps/middleware/src/routes/graph.routes.ts` — graph proxy routes
- `apps/backend` — ConceptNode.java, ConceptEdge.java, AnalysisJob.java models
- `apps/backend` — AnalysisController.java, ConceptGraphController.java, HealthController.java
- `apps/web/(dashboard)` — Dashboard stats page
- E2E: `sprint2-projects.spec.ts`, `dashboard.spec.ts`, `projects.spec.ts`

Known state:
- Projects routes: GET /projects, POST /projects, GET /projects/:id, PUT /projects/:id, DELETE /projects/:id
- Concept Graph models are JPA entities — DB tables need Flyway migrations

---

### Sprint 3 — Analysis, GitHub Proxy, Security Hardening
**Branch**: main (merged)
**SPEC**: §12 (Security), §8A (Bug Fix / QA Audit Trail)

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
**Branch**: main (merged)
**SPEC**: §4 (Session Model), §3 (Agent Roles)

What was built:
- `apps/web/src/app/(dashboard)/` — all Sprint 4 pages:
  - Tickets Kanban board page
  - Sessions page
  - Team / Skills page
  - Planning page
  - AI Strategy page
  - Settings page stub
- `apps/middleware/src/routes/tickets.routes.ts`
- `apps/middleware/src/routes/sessions.routes.ts`
- `apps/middleware/src/routes/skills.routes.ts`
- `apps/middleware/src/routes/ideas.routes.ts`
- Redirect stubs for /ai and /team routes
- `data-testid` attributes added to all Sprint 4 UI elements for E2E
- E2E: sprint4-tickets, sprint4-sessions, sprint4-planning, sprint4-team, sprint4-settings, sprint4-ai specs

Known state:
- All Sprint 4 pages are UI shells — they show mock/static data
- Routes exist in middleware but services behind them are stubs
- WebSocket layer not yet implemented (sessions page will need real-time updates)

---

## 🔜 NEXT SESSION — Sprint 5 Tasks

### SPRINT 5: Token Gateway + Agent Orchestrator + WebSocket
**Target branch**: `feat/sprint-5-orchestrator`
**SPEC sections**: §18H (Token Gateway), §4 (Session Model + Commands), §2.1 (Topology)

---

#### Task 5.1 — Token Gateway Service (middleware)
File: `apps/middleware/src/services/tokenGateway.service.ts`

Build:
```typescript
// Session budget shape
interface SessionBudget {
  sessionId: string;
  maxTokens: number;
  used: number;
  reserved: number;
  hardLimit: number; // 95% of maxTokens
  warnLimit: number; // 80% of maxTokens
  status: 'ok' | 'warning' | 'hard_stop';
}

// TokenGateway must:
// - track token usage per session
// - reserve tokens before parallel calls
// - release reservations on completion
// - emit 'warn' event at 80%
// - block new calls at 95%
// - expose: reserve(), release(), consume(), getStatus(), resetSession()
```

Also update: `apps/middleware/src/routes/ai.routes.ts` — route all Ollama calls through TokenGateway.

E2E to write: `apps/e2e/tests/sprint5-token-gateway.spec.ts`

---

#### Task 5.2 — Agent Orchestrator (backend, Java)
Package: `apps/backend/src/main/java/com/aria/orchestrator/`

Build:
```
orchestrator/
  SessionModel.java          — JPA entity: id, projectId, scope, budget, mode, state
  SessionMode.java           — enum: PLAN_ONLY, APPLY, PRECISION, THROUGHPUT, DESIGN, EXPERIMENT
  SessionState.java          — enum: NEW, RUNNING, PAUSED, COMPLETED, FAILED
  OrchestratorService.java   — startWork(), stopWork(), getSessionStatus(), pauseSession()
  OrchestratorController.java — REST endpoints:
                                POST /orchestrator/start
                                POST /orchestrator/stop
                                GET  /orchestrator/status/:sessionId
                                POST /orchestrator/pause
```

Wire to middleware: add `apps/middleware/src/routes/orchestrator.routes.ts`

---

#### Task 5.3 — WebSocket Layer (middleware)
File: `apps/middleware/src/services/websocket.service.ts`

Build:
- Add `socket.io` to middleware
- Emit events: `agent:status`, `session:update`, `token:warning`, `token:hard_stop`
- Authenticate WebSocket connections with JWT (same middleware as REST)

Update: `apps/web/src/lib/` — add WebSocket client hook `useAriaSocket.ts`
Update: `apps/web/src/app/(dashboard)/` — show real-time agent status indicator in sidebar

E2E to write: `apps/e2e/tests/sprint5-websocket.spec.ts`

---

#### Task 5.4 — PROGRESS.md update + commit + push
- Update this file
- Commit: `feat(sprint5): token gateway, agent orchestrator, websocket layer`
- Create PR to main with full description

---

## 📋 FULL SPRINT ROADMAP

| Sprint | Focus | SPEC | Status |
|---|---|---|---|
| 1 | Auth, monorepo, security baseline | §12, §2.2 | ✅ Done |
| 2 | Projects, dashboard, concept graph models | §6, §15 | ✅ Done |
| 3 | Analysis, GitHub proxy, security hardening | §12, §8A | ✅ Done |
| 4 | Tickets, sessions, team, planning, AI strategy (web UI) | §4, §3 | ✅ Done |
| **5** | **Token Gateway + Agent Orchestrator + WebSocket** | **§18H, §4** | 🔜 Next |
| 6 | Skill Engine — SKILL.md loader, lazy routing, .entiresystem/ store | §9, §2.2 | ⬜ Queued |
| 7 | Concept Graph full — builder, chunker, GraphRAG queries | §6, §18N | ⬜ Queued |
| 8 | Ollama full integration — routed through Token Gateway | §2.3 | ⬜ Queued |
| 9 | gstack agent roles — CEO/CTO/PM/QA/Security role dispatch | §3 | ⬜ Queued |
| 10 | Horizon Scanner — RSS/GitHub Trending/ArXiv feeds, Stability Gate | §10 | ⬜ Queued |
| 11 | Meta-Evolution Architect (Ouroboros Engine) | §18A | ⬜ Queued |
| 12 | Fleet Commander + Pub/Sub mesh + Deadlock Breaker | §17.4 | ⬜ Queued |
| 13 | Flyway DB migrations — all tables versioned | §2.2 | ⬜ Queued |
| 14 | Full security hardening — Red Team, FIM, supply chain | §12, §13.5 | ⬜ Queued |
| 15 | Genesis Pipeline + Omnichannel Analyzer | §16 | ⬜ Queued |
| 16 | Edge Swarm (SLM binaries) + Predictive Data Gravity | §18J, §18K | ⬜ Queued |

---

## ⚠️ KNOWN GAPS (tech debt — fix before Sprint 10)

- Flyway migration files not yet created — ConceptNode, ConceptEdge, AnalysisJob tables not migrated
- GitHub OAuth not fully wired — routes exist but callback + token exchange not complete
- All Sprint 4 web pages show static/mock data — need real API connections from Sprint 6 onward
- `.entiresystem/` canonical store directory not created yet — needed for Sprint 6
- Ollama proxy in middleware not routed through Token Gateway — fix in Sprint 5 Task 5.1
- packages/db Drizzle schema stubs need real table definitions — align with Java JPA entities

---

## 🔐 SECURITY CHECKLIST (run before every PR merge)

- [ ] No HS256 tokens (RS256 only)
- [ ] All new endpoints have Zod validation
- [ ] All user-scoped queries filter by userId from JWT
- [ ] No secrets or API keys in code
- [ ] Helmet + CORS applied to all new routes
- [ ] Rate limiting on any new auth-adjacent endpoints
- [ ] E2E security spec still passes
