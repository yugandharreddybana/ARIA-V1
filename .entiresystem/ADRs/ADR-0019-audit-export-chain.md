# ADR-0019 — Append-only governance audit chain + signed export (V27.9 §20)

**Status:** Accepted (Sprint 12)
**Date:** 2026-05-17

## Context
SOC2 / ISO / GDPR auditors need a cryptographically verifiable record of every Class C+
governance decision. We commit to two artefacts:

1. `audit_chain` — append-only Postgres table with a sha256 chain across rows.
2. `audit_exports` — signed bundles of contiguous `audit_chain` ranges.

## Decision

`audit_chain` row hash:

```
chain_hash = sha256(prev_chain_hash || '|' || canonical(payload))
```

`canonical(payload)`:
- Keys sorted ascending, each key joined as `key=value`, pairs joined by `|`.
- Nested values stringified via `String.valueOf` (good enough for the flat shapes we record).

Export bundle:
- JSON body: `{ scope, from_seq, to_seq, events: [...] }` (events copied verbatim, including
  per-row `chain_hash` so a downstream verifier can re-walk the chain offline).
- Sha256 over the body text.
- Ed25519 signature over the sha256, signed by the daemon key (ADR-0018), recorded as
  `audit_exports.signature`.
- Bundle written to `.aria/audit-exports/<scope>_<from>_<to>.json`.

Verification:
- `GET /api/governance/audit/verify?fromSeq=&toSeq=` re-walks the chain and returns
  `{ verified: boolean }`. Sprint 14 adds a CI job that runs this every release.

## Consequences
+ A single missing or modified row is detectable in one SQL pass.
+ Bundle export is portable — auditors can verify offline with the committed
  `.entiresystem/keys/daemon.pub`.
+ Decision Explainer (`/aria explain <session>`) writes its own `explain.emit` events into the
  chain so why-traces themselves are auditable.
− Minimal JSON canonicaliser is hand-rolled; Sprint 14 swaps to a canonical-JSON library
  (RFC 8785) when the daemon image gains the dep.
− Bundle storage is local-first only in Sprint 12; Sprint 15 Seed Vault encrypts + archives
  exports off-host.
