# EXPERIENCE.md — General lessons learned (cross-skill)

> Curated lessons that apply across every persona. Persona-specific notes live in
> `<persona>_EXPERIENCE.md`. Domain-specific anti-patterns live in
> `.entiresystem/ANTI_PATTERNS/`.
>
> Every entry MUST have a `veracity` tag:
>   - `human-authored`  : written by a human reviewer; never auto-modified.
>   - `human-approved`  : drafted by an agent, accepted by a human via PR review.
>   - `ai-only`         : extracted by Shadow Learning, awaiting human approval.
>
> Knowledge Veracity scoring (ADR-0008) applies a half-life decay to `ai-only`
> entries so stale auto-extracted notes are demoted unless promoted by a human.

---

## Cross-cutting lessons

- **Sprint 1 fix `4532bb0` — auth race.** OAuth callback redirected to `/login` whenever
  `setToken` ran before `setUser`. Always hydrate the user inside `setToken` itself, not in
  the post-redirect effect. (`apps/web/src/contexts/auth.context.tsx`)
  *veracity: human-authored*

- **Sprint 2 fix `2fbf8f0` — Express prefix conflict.** GitHub OAuth routes were unreachable
  when mounted at the top level alongside `/api/auth`. Mount inside `authRouter` so the
  prefix collapses correctly.
  *veracity: human-authored*

- **Sprint 3 fix `5bee096` — shared types vs schema drift.** Drizzle schemas and
  `@aria/shared` types diverged silently. The source of truth is now the Flyway SQL;
  Drizzle pulls via `drizzle-kit pull` and `@aria/shared` is regenerated from Drizzle.
  *veracity: human-authored*

- **Sprint 3 fix `af58828` — refresh tokens.** GitHub OAuth users got
  `REFRESH_TOKEN_INVALID` on silent refresh because tokens were not persisted to DB.
  Persist refresh tokens for OAuth users on every login. (`auth.service.ts`,
  `github-oauth.service.ts`)
  *veracity: human-authored*

- **Sprint 4 fix `7f82f15` — partial-failure UX.** Dashboard fetches must use
  `Promise.allSettled`, not `Promise.all`. One slow/failed endpoint should never blank the
  dashboard.
  *veracity: human-authored*

- **Sprint 5 design — Token Gateway placement.** Sole LLM egress lives in the middleware
  (ADR-0003); Java backend dispatches via HTTP. This keeps rate-limit + JWT auth +
  ReplayFrame writes co-located.
  *veracity: human-approved*

- **Sprint 6 fix — `.gitignore` excluded `.entiresystem/`.** The original rule silently
  excluded the entire knowledge store so Sprint 5 ADRs were never actually committed.
  Always grep for sensitive directories in `.gitignore` whenever adding a new top-level
  directory.
  *veracity: human-authored*

- **Sprint 6 design — Knowledge Veracity tags (ADR-0008).** Every entry in this file and
  in skill `experience.yml` must carry one of the three veracity tags. Meta-Evolution
  (Sprint 17) only consumes `human-authored` and `human-approved`; `ai-only` is advisory
  until a human flips it.
  *veracity: human-authored*
