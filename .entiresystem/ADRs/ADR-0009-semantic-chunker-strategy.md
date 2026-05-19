# ADR-0009 — Semantic Chunker strategy (regex-based, tree-sitter deferred)

**Status:** Accepted (Sprint 8)
**Date:** 2026-05-16

## Context
V27.9 §18N requires structure-aware chunking of every supported language (TypeScript, JavaScript,
Java, Python, SQL, Markdown). The reference implementation uses tree-sitter, but tree-sitter
needs native bindings for each parser and inflates the daemon image significantly.

## Decision
Ship a **regex-based SemanticChunker** in Sprint 8. Per language:

| Language          | Symbol patterns                                                            | Fallback        |
|-------------------|----------------------------------------------------------------------------|-----------------|
| TS / JS / TSX     | `class`, `function`, top-level arrow assignments                           | whole-file `module` |
| Java              | `class / interface / record / enum`, method signatures                     | whole-file `module` |
| Python            | `def`, `class`                                                              | whole-file `module` |
| SQL               | Statement terminator `;` per `CREATE / ALTER / DROP / INSERT / UPDATE / DELETE / SELECT` | one chunk per statement |
| Markdown          | Headings `#` … `######`; if path matches `.entiresystem/ADRs/` → `chunk_type=adr` | preamble + per-section |
| anything else     | one `module` chunk over the whole file                                     | —               |

Summaries + embeddings are filled by `ConceptGraphBuilder` via the `EmbeddingClient` — which
ALWAYS routes through the middleware Token Gateway (ADR-0003).

Upgrade path: Sprint 14 (Phase 9 — Benchmarking + Chaos Sandbox) is when the daemon image gains
native libraries. At that point swap individual languages to tree-sitter behind a feature flag
and validate against the same fixture corpus.

## Consequences
+ Zero native dependencies — daemon image stays small; local-first deploy unchanged.
+ Deterministic, side-effect-free chunking; trivial to unit test.
+ Handles every Sprint 1-7 file shape we actually ship.
− False positives on unusual method signatures (Java generics with nested `< >` etc.) — acceptable
  for Sprint 8 because the symbol bucket is keyword-ranked by the distillation engine.
− No syntactic call-graph (caller → callee edges) yet. Sprint 10 (Fleet) adds a separate edge
  extractor that runs on the same chunks.
