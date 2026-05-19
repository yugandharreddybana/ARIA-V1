# ADR-0002 — Use socket.io for the ARIA WebSocket layer

**Status:** Accepted (Sprint 5)
**Date:** 2026-05-16
**Deciders:** Owner; V27.9 §2.1 anchor

## Context
The dashboard needs a live status indicator and the Orchestrator needs to push token-budget warnings,
session transitions, and queue-depth events. We need JWT-auth on handshake (same RS256 keys as REST),
room semantics (session.<id>, agent.<id>, system.health), and reconnect.

## Decision
Use **`socket.io`** (server + client) on path `/ws`. The HTTP server in `apps/middleware/src/index.ts`
hosts both Express and the socket.io upgrade. Handshake verifies the access token via the same code path
used by the REST `requireAuth` middleware.

## Consequences
+ Auto-reconnect, room broadcast, fallback transports out of the box.
+ Mature TypeScript types and battle-tested in Node 20.
+ One process to operate.
− Slightly heavier than `ws`. Acceptable for local-first deploy.
− Browser dependency: `socket.io-client` adds ~25 KB gzipped to the web bundle (acceptable).
