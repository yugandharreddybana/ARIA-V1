# database — ANTI_PATTERNS.md

## Forbidden patterns

- **`SELECT *` in user-facing APIs.** Always enumerate columns to prevent leaking new
  columns by accident and avoid N+1 patterns over related rows.
- **Hibernate `ddl-auto: update` in production.** Schema lives in Flyway only; production
  runs `validate` so Hibernate fails fast on schema drift.
- **Auto-`down()` on stateful migrations.** Zero-Downtime Migration Orchestrator (Sprint 9)
  refuses to auto-rollback any phase with `rollback_type: stateful_dangerous` after real
  traffic has flowed.
- **Postgres ENUM types for columns Hibernate maps to Java enums.** Drift between the two
  is a constant source of pain — use TEXT + CHECK constraint instead (V5 onward).
- **Hand-rolled UUID generation in app code.** Use `gen_random_uuid()` / `uuid_generate_v4()`
  at the DB so all tables share one source of randomness.
