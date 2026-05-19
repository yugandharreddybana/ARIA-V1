# backend-api — persona EXPERIENCE.md

## Lessons

- **Zod `.strict()` on every endpoint.** Sprint 6 mass-assignment probes will hit anything
  that accepts extra keys silently. *veracity: human-authored*

- **IDOR check on every user-scoped route.** Pull `userId` from the verified JWT
  (`req.user.userId`), never from request body or params. The Java orchestrator
  `loadOwned(id, userId)` pattern (Sprint 5) is the canonical example.
  *veracity: human-authored*

- **Token Gateway egress only.** Direct provider calls (Ollama or Anthropic) bypass the
  rate limit, budget enforcement, and ReplayFrame audit chain. CI will fail any new direct
  call after Sprint 9. *veracity: human-approved*

- **stringtype=unspecified.** Required on the Spring JDBC URL so String↔UUID columns
  interoperate without a custom Hibernate converter. *veracity: human-authored*

## Anti-patterns

- `req.body.userId` — IDOR by trust-the-client.
- `SELECT *` in API queries (N+1, also leaks columns).
- Schema changes without a Flyway migration committed in the same PR.
