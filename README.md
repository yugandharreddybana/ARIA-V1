# ARIA V1

**Autonomous Repository Intelligence Agent** — A local-first AI engineering organization that lives around your codebase.

ARIA gives you a full AI engineering team (Product, Engineering, QA, Security, DevOps, Finance, AI Strategy) that works with your GitHub repos following real-world Agile processes: planning, sprints, scrums, evidence-based tickets, reviews, and retrospectives.

---

## Architecture

```
apps/
  web/          → Next.js 14 frontend (React, TypeScript, shadcn/ui, Tailwind)
  middleware/   → Node.js/Express API (Auth, WebSockets, GitHub/Jira/Ollama proxy)
  backend/      → Java 21/Spring Boot 3 (Business logic, DB, Skill engine, Repo analysis)
  e2e/          → Playwright + Chromium end-to-end tests
packages/
  shared/       → Shared TypeScript types and utilities
  db/           → Drizzle schema (TS types) + Flyway migrations (Java)
  config/       → Zod env validation and shared config
```

## Quick Start

### Prerequisites
- Node.js >= 20
- pnpm >= 9
- Java 21
- Docker (for Postgres local dev)
- Ollama running on localhost:11434

### Setup

```bash
# 1. Clone and install
git clone https://github.com/yugandharreddybana/ARIA-V1.git
cd ARIA-V1
pnpm install

# 2. Generate JWT keys
bash scripts/generate-keys.sh

# 3. Configure environment
cp .env.example .env.local
# Fill in your values in .env.local

# 4. Run development
pnpm dev
```

## Security

- JWT RS256 (asymmetric key pair) for auth tokens
- Passwords hashed with bcrypt (cost factor 12)
- HttpOnly cookies for refresh tokens
- Rate limiting on all auth endpoints
- Helmet.js HTTP security headers
- Zod input validation on every API endpoint
- CORS restricted to configured origins

## License

Private — All rights reserved.
