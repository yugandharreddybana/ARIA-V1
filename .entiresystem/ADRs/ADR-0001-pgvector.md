# ADR-0001 — Postgres + pgvector for all embeddings & graph storage

**Status:** Accepted (Sprint 5)
**Date:** 2026-05-16
**Deciders:** Owner; V27.9 §18N anchor

## Context
V27.9 §18N (Advanced RAG + Concept Graph) requires vector embeddings for ≥5× context compression on large
codebases and a 4-level Concept Graph (Symbol / Module / Domain / Decision). The system is local-first
(SPEC §1) so an additional storage engine inflates ops complexity.

## Decision
Use Postgres 16 with the `pgvector` extension for **all** vector + graph storage. No Qdrant, no Neo4j, no
dedicated vector DB. Embedding dimension fixed at **768** (Ollama `nomic-embed-text` default).

## Consequences
+ Single backup, single failure domain, single auth surface.
+ HNSW indexes on Level 1 + Level 3 give sub-100 ms ANN at the scales we target (≤1 M nodes per repo).
+ Concept Graph traversal stays in SQL — no cross-store joins.
− Heavier write-amplification on graph rebuilds vs. a graph-native DB; mitigated by incremental updates.
− If we ever exceed ~10 M concept nodes per workspace, we revisit (Sprint 8 load test will trigger this).
