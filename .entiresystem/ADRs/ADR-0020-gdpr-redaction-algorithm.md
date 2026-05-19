# ADR-0020 — GDPR redaction-aware attestation (V27.9 §12)

**Status:** Accepted (Sprint 12)
**Date:** 2026-05-17

## Context
GDPR Article 17 and CCPA §1798.105 require erasure on request. The system must:

1. Actually remove PII from active storage.
2. Preserve a tamper-proof audit trail proving the deletion occurred + when.
3. Never store the original value after redaction.

## Decision

For each redaction:

```
original_value_hash = sha256(original)            # stored
redacted_token      = "[REDACTED:" || sha256(table || '|' || source_id || '|' || column)[0..8] || "]"
prev_chain_hash     = SELECT chain_hash FROM gdpr_redactions ORDER BY redacted_at DESC LIMIT 1
chain_hash          = sha256(prev_chain_hash || '|' || redacted_token || '|' || iso_timestamp)
```

The original value is **never stored**. The caller is responsible for the actual UPDATE on
the source table (they own the SQL dialect of the affected column); the service computes +
persists the metadata in `gdpr_redactions` and appends a `gdpr.redaction` event to
`audit_chain` (ADR-0019).

Re-redaction is idempotent — the same `(table, source_id, column)` produces the same
`redacted_token`.

Allowed reasons: `gdpr-erasure`, `ccpa-erasure`, `data-minimisation`. Anything else fails Zod
validation at the middleware boundary.

## Consequences
+ Auditors can prove that a redaction happened at time T even though the original value is
  gone — the chain links every redaction together.
+ Redaction tokens are stable across re-runs, so downstream caches reach the same value.
+ Hash-chain integrity is independent of `audit_chain` — both must validate for SOC2.
− We trust the caller to actually run the UPDATE. Sprint 14 adds a reconciler that flags
  rows still containing original PII despite having a `gdpr_redactions` entry.
