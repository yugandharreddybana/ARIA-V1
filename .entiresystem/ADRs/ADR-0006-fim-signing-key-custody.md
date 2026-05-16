# ADR-0006 — FIM signing key custody (V27.9 §12)

**Status:** Accepted (Sprint 6)
**Date:** 2026-05-16

## Context
File Integrity Monitor signs SKILL.md, DESIGN.md, DOMAIN_BOUNDARIES.json, CORE_VALUES.yml with a per-daemon
Ed25519 keypair. We need to nail down where the private key lives and who can rotate it.

## Decision
- **Private key:** `<repo>/.aria/keys/daemon.ed25519` — PKCS8 PEM, **mode 0600**, **gitignored** (in
  `.gitignore`). Generated automatically on first daemon boot if missing.
- **Public key:** `<repo>/.entiresystem/keys/daemon.pub` — SPKI PEM, **committed to git** so reviewers can
  verify registry signatures without running the daemon.
- **Registry:** `<repo>/.entiresystem/fim_registry.json` — committed; each entry includes the Ed25519
  signature over `"<path>:<sha256>"` plus the SHA-256 of the public key as `signed_by`.
- **Rotation:** Manual. Delete the private key on disk, restart the daemon, re-sign the registry, commit the
  new public key + registry. (Sprint 15 adds an automated quarterly rotation under Seed Vault.)

## Consequences
+ Public verifiability without secret material exposure.
+ Drift detection (modified, missing, untracked, invalid_signature) works locally even when offline.
− Local-only key custody is acceptable for the local-first deployment target. Cloud deploys will need
  HashiCorp Vault MCP wiring — handled in Sprint 15 (HR + Defcon-1).
