# ADR-0014 — Fleet Envelope format + signing (V27.9 §17.4)

**Status:** Accepted (Sprint 10)
**Date:** 2026-05-17

## Context
Cross-repo / cross-agent fleet events need to be verifiable end-to-end so that any participant
can refuse forged messages. We need the on-the-wire shape locked in early so producers and
consumers in different sprints can interoperate.

## Decision
Envelope shape (REST payload + Redis Stream value):

```json
{
  "epicId":    "<string>",
  "topic":     "<string>",
  "payload":   "<canonical JSON or opaque string>",
  "agentId":   "<registered agent id>",
  "signature": "<base64 Ed25519 over the canonical bytes>",
  "ts":        "<ISO-8601, set by the producer>"
}
```

Canonical signing input (deterministic, version-locked):

```
{epicId}|{topic}|{payload}|{agentId}
```

Rules:
- Every producer MUST hold an Ed25519 keypair registered via `POST /api/fleet/agents`. The
  private key is returned once at registration; lose it = rotate the agent.
- Consumers MUST verify the signature against `agent_registry.ed25519_pubkey` before persisting
  or acting on the envelope. Verification failure = drop + log `FLEET_ENVELOPE_REJECTED`.
- `payload` is treated as opaque bytes for signing. Producer + consumer agree on the JSON
  canonicaliser via topic contract. Sprint 14 adds an in-repo canonicaliser to remove this
  responsibility.
- Canonical topics ship-locked in `FleetCommanderService.CANONICAL_TOPICS`:
  `CONTRACT_DRAFTED`, `SCHEMA_UPDATED`, `CLIENT_IMPLEMENTATION_READY`, `CONTRACT_TEST_RESULTS`,
  `FLEET_HEALING_CIRCUIT_BREAKER`. New topics require an ADR amendment.

## Consequences
+ Any consumer can independently verify any envelope it received — no central authority needed.
+ Replay-safe when combined with the Sprint 14 ReplayFrame (signature is unique per envelope
  body + agent).
+ Producers in different sprints don't need to coordinate beyond the canonical signing input.
− Payload canonicalisation is producer/consumer responsibility until Sprint 14 — minor extra
  coordination cost.
− Private-key rotation is manual until Sprint 12 (Governance) wires the OS-keychain integration.
