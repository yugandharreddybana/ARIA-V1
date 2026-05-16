# ARIA-V1 — Claude Code Master Instructions

> READ THIS FILE FIRST. This is your complete operating manual for every session.
> Do NOT load SPEC.md into context. Quote specific sections only when asked.

---

## 1. What This Project Is

ARIA (Autonomous Repository Intelligence Agent) is a local-first, multi-agent autonomous
engineering platform. It gives software products a full AI engineering team (CEO, CTO, PM,
QA, Security, DevOps, Finance, AI Strategy) that works autonomously following real-world
Agile processes: planning, sprints, tickets, reviews, and retrospectives.

Full canonical specification: SPEC.md (v27.9) — 23 sections, 16 implementation phases.
Do NOT load it. Reference PROGRESS.md for current status and quote specific SPEC sections only when needed.

---

## 2. Monorepo Structure (Turborepo + pnpm)

```
ARIA-V1/
├── apps/
│   ├── web/          → Next.js 14, React 18, TypeScript, shadcn/ui, Tailwind CSS
│   │   └── src/
│   │       ├── app/
│   │       │   ├── (auth)/         → Login, Register, Forgot Password pages
│   │       │   ├── (dashboard)/    → Main app shell with sidebar nav
│   │       │   └── auth/           → Auth API callback routes
│   │       ├── components/         → Shared UI components
│   │       ├── contexts/           → React context providers
│   │       ├── lib/                → API client, utilities
│   │       └── types/              → Frontend TypeScript types
│   │
│   ├── middleware/   → Node.js 18+ / Express 5, TypeScript
│   │   └── src/
│   │       ├── app.ts              → Express app setup (Helmet, CORS, rate-limit)
│   │       ├── index.ts            → Server entry point
│   │       ├── config/             → Environment config
│   │       ├── controllers/        → Request handlers
│   │       ├── middleware/         → Auth middleware, error handlers
│   │       ├── routes/             → Route definitions:
│   │       │   ├── auth.routes.ts
│   │       │   ├── projects.routes.ts
│   │       │   ├── tickets.routes.ts
│   │       │   ├── sessions.routes.ts
│   │       │   ├── skills.routes.ts
│   │       │   ├── graph.routes.ts
│   │       │   ├── ai.routes.ts
│   │       │   ├── analysis.routes.ts
│   │       │   ├── github.routes.ts
│   │       │   ├── ideas.routes.ts
│   │       │   └── health.routes.ts
│   │       ├── schemas/            → Zod validation schemas
│   │       ├── services/           → Business logic services
│   │       └── types/              → TypeScript types incl. AriaRequest
│   │
│   ├── backend/      → Java 21, Spring Boot 3, Maven
│   │   └── src/main/java/com/aria/
│   │       ├── AriaBackendApplication.java   → Spring Boot entry point
│   │       ├── config/             → Spring config classes
│   │       ├── controller/
│   │       │   ├── AnalysisController.java
│   │       │   ├── ConceptGraphController.java
│   │       │   └── HealthController.java
│   │       ├── dto/                → Data transfer objects
│   │       ├── exception/          → Exception handlers
│   │       ├── model/
│   │       │   ├── ConceptNode.java
│   │       │   ├── ConceptEdge.java
│   │       │   └── AnalysisJob.java
│   │       ├── repository/         → Spring Data JPA repositories
│   │       ├── security/           → Spring Security config
│   │       └── service/            → Service layer
│   │
│   └── e2e/          → Playwright + Chromium
│       ├── playwright.config.ts
│       └── tests/
│           ├── sprint1-auth.spec.ts
│           ├── sprint2-projects.spec.ts
│           ├── sprint3-analysis.spec.ts
│           ├── sprint4-tickets.spec.ts
│           ├── sprint4-sessions.spec.ts
│           ├── sprint4-planning.spec.ts
│           ├── sprint4-team.spec.ts
│           ├── sprint4-settings.spec.ts
│           ├── sprint4-ai.spec.ts
│           ├── dashboard.spec.ts
│           ├── projects.spec.ts
│           ├── security.spec.ts
│           ├── github-auth.spec.ts
│           ├── global.setup.ts
│           ├── helpers/
│           ├── auth/
│           └── projects/
│
├── packages/
│   ├── shared/       → Shared TypeScript types and utilities (used by web + middleware)
│   ├── db/           → Drizzle ORM schema (TS) + Flyway migrations (Java/SQL)
│   └── config/       → Zod env validation and shared config
│
├── scripts/          → Shell/PowerShell scripts (e.g., generate-keys.sh)
├── turbo.json        → Turborepo pipeline config
├── package.json      → Root pnpm workspace config
├── CLAUDE.md         → THIS FILE — Claude Code operating manual
├── PROGRESS.md       → Session handoff file — READ THIS to know current state
└── SPEC.md           → Full system spec v27.9 — DO NOT load fully
```

---

## 3. Tech Stack Reference

| Layer | Technology | Key Libraries |
|---|---|---|
| Frontend | Next.js 14 App Router, React 18, TypeScript | shadcn/ui, Tailwind CSS, Zod |
| Middleware | Node.js 18+, Express 5, TypeScript | helmet, cors, express-rate-limit, jsonwebtoken, bcryptjs, zod |
| Backend | Java 21, Spring Boot 3, Maven | Spring Security, Spring Data JPA, PostgreSQL driver |
| Database | PostgreSQL (Docker for local dev) | Drizzle ORM (TS schemas), Flyway (Java migrations) |
| AI / LLM | Ollama (local, localhost:11434) | qwen2.5-coder for drafting; remote Claude for security/schema |
| E2E Tests | Playwright, Chromium | Device matrix: 375x667, 768x1024, 1920x1080 |
| Monorepo | Turborepo, pnpm workspaces | |
| Auth | JWT RS256 (asymmetric), bcrypt cost 12, HttpOnly refresh cookies | |

---

## 4. Security Rules (SPEC §12) — NEVER VIOLATE

- JWT: RS256 asymmetric keys ONLY. Never HS256.
- Passwords: bcrypt, cost factor 12.
- Refresh tokens: HttpOnly cookies only. Never in localStorage.
- All endpoint inputs: Zod validated. No raw req.body access without schema.
- IDOR: Every user-scoped route must check ownership (userId from JWT, not from request body).
- CORS: Restricted to configured origins only.
- Rate limiting: On all auth endpoints.
- Helmet.js: On all Express responses.
- No secrets in code: All secrets via .env.local only.

---

## 5. Git and GitHub Rules

- Branch naming: `feat/sprint-N-<short-description>` for new features.
- Commit message format: `type(scope): description`
  - Types: feat, fix, chore, test, refactor, docs, security
  - Examples:
    - `feat(middleware): add token gateway service`
    - `fix(web): correct dashboard stat labels`
    - `test(e2e): add sprint5 token gateway specs`
- NEVER push directly to main for new features — create a branch + PR.
- EXCEPTION: Minor fixes, config changes (like PROGRESS.md updates) can go directly to main.
- When asked to push code: commit on current branch, push, then create PR if it is a feature branch.
- Always run lint + tests BEFORE committing.
- PR description must include: what was changed, what tests pass, and what SPEC section it implements.

---

## 6. Session Rules (Token Optimization)

1. **Start every session**: Read CLAUDE.md + PROGRESS.md ONLY. Nothing else.
2. **Do NOT load SPEC.md** into context. If you need spec details, say which section and I will paste it.
3. **One sprint per session**. Do not start Sprint N+1 until Sprint N tasks in PROGRESS.md are done.
4. **Write real code**. Never describe what you would do — write the actual code.
5. **Run tests after every file change**. Failing tests are a hard blocker before moving on.
6. **Short responses**: code block + 1-2 sentence explanation. No essays.
7. **End every session**: Update PROGRESS.md — move done items to ✅, update 🔜 with next session tasks.
8. **LLM routing**: Use local Ollama (qwen2.5-coder) for drafting code. Escalate to remote model only for security, schema design, or governance decisions.
9. **Ask before changing**: If a change touches security, schema, or passing E2E tests — ask first.

---

## 7. SPEC Section Quick Reference (quote only when needed)

| Topic | SPEC Section |
|---|---|
| Architecture topology | §2.1 |
| State stores / .entiresystem/ | §2.2 |
| Agent roles and personas | §3 |
| Session model + commands | §4 |
| Governance / action classes | §5 |
| Knowledge / memory layers | §6 |
| Context management (Needle-Threading) | §7 |
| Sandboxes and Git operations | §8 |
| Autonomous bug fix + visual QA | §8A |
| Skill ecosystem (SKILL.md) | §9 |
| Horizon Scanner | §10 |
| Finance / Procurement | §11 |
| Security, FIM, Compliance | §12 |
| QA, Red Team, Evaluation | §13 |
| Design system / UX | §14 |
| Business logic / specs | §15 |
| Genesis pipeline | §16 |
| Telemetry / Fleet Commander | §17 |
| HR / Kill switch / Chesterton | §18 |
| Meta-Evolution Architect | §18A |
| Token Gateway | §18H |
| Concept Graph | §18N (or §6) |

---

## 8. Protected Files — Never Modify Without Human Approval

- `SPEC.md` — canonical spec, read-only
- `CORE_VALUES.yml` — when created, read-only forever
- `DESIGN.md` — when created, read-only unless ADR + human approval
- All passing E2E test files for completed sprints (sprint1 through sprint4)
- `scripts/generate-keys.sh`

---

## 9. Environment Setup (for local dev)

```bash
# Prerequisites
Node.js >= 20, pnpm >= 9, Java 21, Docker, Ollama on localhost:11434

# Install
git clone https://github.com/yugandharreddybana/ARIA-V1.git
cd ARIA-V1
pnpm install
bash scripts/generate-keys.sh
cp .env.example .env.local
# Fill in .env.local
pnpm dev
```

Environment variables (see .env.example):
- DATABASE_URL — PostgreSQL connection string
- JWT_PRIVATE_KEY / JWT_PUBLIC_KEY — RS256 PEM keys
- GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET
- OLLAMA_BASE_URL — default http://localhost:11434
- CORS_ORIGIN — frontend URL

---

## 10. Definition of Done (Every Sprint)

A sprint task is DONE when ALL of the following are true:
- [ ] Code written and compiles without errors
- [ ] Lint passes (`pnpm lint` or `mvn checkstyle:check`)
- [ ] Unit tests pass
- [ ] E2E spec for the sprint passes (if applicable)
- [ ] No new security violations (IDOR, missing Zod, hardcoded secrets)
- [ ] PROGRESS.md updated
- [ ] Committed and pushed to correct branch
