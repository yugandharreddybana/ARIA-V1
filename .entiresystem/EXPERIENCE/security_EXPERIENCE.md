# security — persona EXPERIENCE.md

## Lessons

- **Two-stage sanitizer is mandatory on untrusted ingress** (ADR-0004). Defensive
  posture flips to auto-reject after `>20 quarantines / 60 min`.
  *veracity: human-approved*

- **FIM signs CORE_VALUES, DESIGN, DOMAIN_BOUNDARIES, SKILL** (ADR-0006). Private key
  never leaves `.aria/keys/`. Public key + signed registry are committed.
  *veracity: human-approved*

- **Legal Kill-Switch on copyleft.** Any GPL/AGPL/LGPL/MPL/SSPL match must hard-delete
  the offending code from the branch and clear the agent's session memory before review.
  *veracity: human-authored*

- **RS256 JWT, never HS256.** Asymmetric keys ensure the Spring backend can verify
  middleware-issued tokens without sharing a secret. *veracity: human-authored*

## Anti-patterns

- HS256 tokens (anywhere).
- Refresh tokens in `localStorage` (must be HttpOnly cookies).
- Sanitizer bypass markers (`// @sanitizer-bypass`) — CI fails on these.
- Storing raw refresh tokens in DB — only sha256 hashes (`refresh_tokens.token_hash`).
