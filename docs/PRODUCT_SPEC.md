# ARIA — Product Spec (from owner Yugandhar, 2026-10-25)

Scope now: single user (the owner), running locally on his machine. Not multi-tenant SaaS yet, but keep code clean enough to grow.

## Core idea
ARIA turns a user's GitHub repo into a working AI software company. Agents understand the product, own parts of it, coordinate like a real agile IT company, write code and open pull requests, test and secure every change, keep learning, and proactively look for ways to bring AI into the user's product. The user approves every merge and every major proposal.

## Flow
1. Account: signup/login.
2. Project: create project; choose LLM provider (default: Cursor; also Gemini, Groq, Ollama, OpenAI, Anthropic, any OpenAI-compatible API), enter credentials, Test Connection must pass before continuing. Secrets encrypted at rest.
3. Connect GitHub repos.
4. Repo understanding: analyst agent reads repos and builds a knowledge map — tech stack, modules, business flows (signup, login, homepage, ...), data model, APIs. Everything later relies on this.
5. Company generation: propose a full company sized to the repo. User chooses size/mix (e.g. 10 agents: business, 3–4 QA, 4–5 dev with any mix of full-stack/frontend/backend/junior).
   Roles include: CEO, CFO, CTO, business/strategy, product owner, scrum master, frontend, backend, full-stack, junior devs, AI/ML team, QA, DevOps, cybersecurity, red team, blue team, research agent, learning/coach agent, documentation agent, PR/merge coordinator agent.
   Each agent: unique realistic human name, role, clear instructions, skills, manager, owned flows, backup agent, status on/off.
6. Org chart: interactive graph of the company (who reports to whom, responsibilities). User can view, edit roles/responsibilities/instructions, add, delete, and toggle any agent ON/OFF (OFF agents consume zero tokens; turn back on anytime).
7. Flow ownership: every business flow has an owner (often separate frontend + backend owners) plus a backup. Owners can have worker agents. Future changes to a flow are routed to its owner automatically.
8. Work: stories on a board (backlog → in progress → review → QA → done). One task at a time per agent. Cross-agent dependencies: the owner sends a clear written request (what, why, expected outcome/contract); the dependent agent delivers; owner verifies end to end before done.
9. Quality gate for every change: peer code review, QA covering every scenario incl. UI checks, regression tests (nothing existing breaks), security review → PR on the user's repo → USER APPROVES MERGE. Agents never merge themselves.
10. PR/merge coordinator agent: tracks all open agent PRs and tells the user the safe merge ORDER to avoid conflicts (detect overlapping files/dependencies, suggest rebases).
11. Security: red team actively attacks the app (injection, broken access control, auth bypass, data exfiltration from DB, secrets leakage); blue team fixes; loop until clean.
12. Agile ceremonies as TEXT LOGS: daily morning standup run by the scrum master agent — calls each agent in turn, agent gives update (yesterday/today/blockers), scrum master may ask follow-up questions, agent answers, then next agent. Also sprint planning, strategy calls, retrospectives. All transcripts visible in the app, plus the code/PRs each agent produced.
13. Leadership & ideas: CEO/CFO/leadership think proactively about new ideas (especially AI features for the user's product, e.g. AI time management). Research agent analyzes each idea: client benefit, expected improvement, cost/effort; gives opinion; CFO reviews cost/value. Then a formal PROPOSAL goes to the user: what, why, expected impact, number of stories, implementation changes, clear docs. Only after user approval does it become stories and get built.
14. Documentation agent: at initial setup, documents every workflow (setup, signup, login, every feature) Confluence-style under a `confluence/` (docs) folder — how it works, methods, data accepted/returned, diagrams (mermaid) — clear enough to share with anyone. Keeps docs updated as flows change.
15. Learning: research/coach agent tracks new techniques and skills, shares them; agents improve their own instructions and behavior; strong focus on minimal token usage (budgets per call/session/agent).

## Model tiering
Every model call declares a task type. Task types belong to one of two classes:

- **Planning** (default tier `top`): repo understanding / knowledge map, company generation, sprint and strategic planning, architecture, CEO/CFO/research idea analysis and proposals, security review.
- **Development** (default tier `auto`): coding, tests, fixes, documentation updates.

The project can change either class to `top` or `auto`, and can pin the concrete model id for each tier. An agent can override either class, or pin one model id for every task that agent runs. Resolution order: agent model id, then agent tier, then project tier, then the default. The chosen model id is what the token-budget queue reserves and dispatches. An agent that is OFF never reaches the queue.

Cursor is the default provider:

- Development uses Cursor **Auto**. The value stored in ARIA is `auto`. The Cloud Agents API does not accept that literal string. A future cloud-agent launch sends model id `auto-smart` with `optimize_for=cost` (Cursor Router). See `docs/CURSOR_PROVIDER.md`.
- Planning uses a pinned top-tier id, `claude-4.6-opus-thinking`, until the project overrides it. Confirm the id against `GET /v1/models`; the public catalog example uses ids such as `claude-4.6-sonnet-thinking` and `composer-2`.
- Cursor still has no chat-completions endpoint. The queue selects the tier's model and the dispatcher refuses the completion, so setup does not pretend a cloud-agent run is a chat reply. Knowledge-map structure and the org chart still come from the repo read and the role templates.

Other providers use the same two tiers with a premium model and a standard model (for example OpenAI `gpt-4.1` / `gpt-4.1-mini`, Anthropic `claude-opus-4-7` / `claude-sonnet-4-6`). Ollama and any OpenAI-compatible server the owner hosts use the model they already tested for both tiers until they set two ids. Defaults are overridable because provider catalogs change.

Company generation still builds people from role templates. It also dispatches one `company_generation` call through the queue on the planning model. When that call cannot complete, the template org is what the user edits. The reply is not written onto agents.

## Non-negotiables
- Agents behave like a real IT company with proper roles.
- Every change fully tested; no regressions; UI verified.
- Strong security; no data leakage from DB.
- User approves every merge and every idea proposal.
- Token efficiency everywhere.
