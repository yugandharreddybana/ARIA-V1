# auth — ANTI_PATTERNS.md

## Forbidden patterns

- **HS256 JWT.** Asymmetric RS256 only.
- **Refresh tokens in `localStorage`.** Use HttpOnly cookies with `SameSite=Lax` (and
  `Secure` in production).
- **Trusting `req.body.userId`.** Always pull the userId from the verified JWT claim
  (`req.user.userId` in middleware, `SecurityContextHolder` → `AriaAuthentication` in Java).
- **Raw refresh tokens stored in DB.** Only sha256 hashes (`refresh_tokens.token_hash`).
- **Signing in/out without revoking the refresh token row.** Logout must mark
  `refresh_tokens.is_revoked = true` for the jti.
- **bcrypt cost factor < 12.** Cost 12 is the floor (CLAUDE.md §4).
