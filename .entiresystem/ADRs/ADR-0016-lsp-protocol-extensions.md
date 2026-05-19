# ADR-0016 — LSP protocol extensions (V27.9 §18M)

**Status:** Accepted (Sprint 11)
**Date:** 2026-05-17

## Context
ARIA needs an in-editor surface for hover summaries, ghost-text diffs, inline task dispatch,
and file-lock indicators. The standard LSP `textDocument/hover` covers the first; the rest
need either custom server methods or `workspace/executeCommand` payloads we lock in here.

## Decision

| Capability                | Mechanism                                             |
|---------------------------|-------------------------------------------------------|
| Symbol hover              | Standard `textDocument/hover` returning markdown.    |
| Ghost-text diff accept    | `executeCommand` → `aria.diff.accept`                |
| Ghost-text diff reject    | `executeCommand` → `aria.diff.reject`                |
| File lock acquire         | `executeCommand` → `aria.lock.acquire`               |
| File lock release         | `executeCommand` → `aria.lock.release`               |
| Inline `/fix`             | `executeCommand` → `aria.dispatch.fix`               |
| Inline `/test`            | `executeCommand` → `aria.dispatch.test`              |
| Inline `/explain`         | `executeCommand` → `aria.dispatch.explain`           |
| Inline `/red-team`        | `executeCommand` → `aria.dispatch.redTeam`           |
| Inline `/compliance`      | `executeCommand` → `aria.dispatch.compliance`        |
| Inline `/design-check`    | `executeCommand` → `aria.dispatch.designCheck`       |
| File lock state notif     | Custom notification `aria/lockState` (Sprint 14)     |
| Diagnostics stream        | Standard `textDocument/publishDiagnostics` (Sprint 14)|

`executeCommand` arguments are passed as a single object so adding optional fields stays
backwards-compatible. Every command round-trips through the ARIA middleware at `/api/lsp/*`
so we keep auth, rate limits, and audit in one place.

Transport: **stdio** in Sprint 11. WebSocket transport for JetBrains + Neovim integrations
ships in Sprint 14.

Perf budgets:
- Hover responses: **< 100 ms p95** at the LSP boundary (Concept Graph distillation may take
  longer; the middleware caches recent hover payloads per `(projectId, filePath, symbol)`).
- Completion suggestions: **< 500 ms p95** (Sprint 14 work).
- Diagnostics on save: **< 1 s p95** (Sprint 14 work).

## Consequences
+ One `executeCommand` namespace (`aria.*`) is the entire surface — easy to lock down with the
  `commands` allow-list in `initialize`.
+ Every command audit-trails via `/api/lsp/*` ReplayFrames + telemetry.
− WebSocket transport deferred — JetBrains / Neovim get tooling later; stdio works for VS Code today.
− `aria/lockState` notification format is reserved here but not yet implemented; Sprint 14
  wires it once the editor extension owns real-time lock decoration.
