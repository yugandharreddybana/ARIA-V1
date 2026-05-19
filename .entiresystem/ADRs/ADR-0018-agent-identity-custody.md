# ADR-0018 — Agent identity custody (V27.9 §12)

**Status:** Accepted (Sprint 12)
**Date:** 2026-05-17

## Context
Sprint 10 introduced per-agent Ed25519 keypairs. Sprint 12 locks down how those keys travel
between the agent process, the operator's keystore, and the daemon's signing infrastructure
without ever transiting an untrusted boundary in plaintext.

## Decision

| Surface                              | Storage                                                |
|--------------------------------------|--------------------------------------------------------|
| Agent private key                    | OS keychain on the agent host (libsecret / Keychain).  |
| Agent private key in transit         | NEVER. `AgentRegistryService.register()` returns it once over HTTPS to the human operator; daemon never sees it again. |
| Agent public key                     | `agent_registry.ed25519_pubkey` (SPKI base64).         |
| Public key fingerprint               | `agent_registry.fingerprint` (sha256 SPKI DER).        |
| Daemon signing key (audit export)    | `.aria/keys/daemon.ed25519` (mode 0600, gitignored).   |
| Daemon public key                    | `.entiresystem/keys/daemon.pub` (SPKI, committed).     |

Rotation:
- Agent rotation = new `register()` call + agent process restarts holding the new key. Old
  agent_id can be retired (`status = retired`) but rows it signed remain verifiable.
- Daemon rotation = generate new keypair, commit new pub key + Seed Vault entry (Sprint 15),
  re-sign the audit ledger high-water mark.

## Consequences
+ Private keys never live in env vars, log files, or HTTP responses past the first issuance.
+ Verification works offline against the committed public key.
+ Rotation does not invalidate historical envelopes (lookup by `agent_id` returns the old key
  until explicit retirement).
− Operator handling of the private key is a manual responsibility until Sprint 15 wires the
  Seed Vault to also escrow agent keys.
