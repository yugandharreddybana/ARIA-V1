# .entiresystem/ — ARIA Canonical Knowledge Store

This directory is the single source of truth for everything ARIA learns and decides about a product.
It is **committed to git** so every change is reviewable; daemon-private runtime (private keys, replay
DB, hydration cache, seed vault) lives in `.aria/` (which IS gitignored).

Spec anchors: V27.9 §2.2 (state stores), §6 (memory layers), §9 (skill ecosystem), §12 (FIM).
Layout locked by **ADR-0007**. Veracity scoring by **ADR-0008**.

## Layout

| Path                              | What it is                                                                              |
|-----------------------------------|-----------------------------------------------------------------------------------------|
| `CORE_VALUES.yml`                 | Priority-ordered company values. FIM-signed, read-only after Sprint 7.                 |
| `DESIGN.md`                       | UI/brand contract. FIM-signed, read-only after Sprint 7.                                |
| `DOMAIN_BOUNDARIES.json`          | Services + domains + ownership. FIM-signed.                                             |
| `SKILL.md`                        | Top-level skill index. FIM-signed.                                                      |
| `fim_registry.json`               | Ed25519-signed hashes of the four files above. Committed for public verifiability.      |
| `.gitignore`                      | Excludes only regenerable `embeddings/` and `*/temp/`.                                  |
| `keys/daemon.pub`                 | Ed25519 public key. Private key lives in `.aria/keys/daemon.ed25519` (gitignored).      |
| `ADRs/`                           | Architecture Decision Records, append-only. `ADR-NNNN-<short>.md`.                      |
| `EXPERIENCE/`                     | `EXPERIENCE.md` (cross-cutting) + `<persona>_EXPERIENCE.md`. Veracity-tagged.           |
| `ANTI_PATTERNS/`                  | Per-domain forbidden patterns (`auth`, `database`, `ux`, …).                            |
| `skills/<slug>/SKILL.md`          | Per-skill SKILL.md with frontmatter + Transparency Card (V27.9 §9).                     |
| `skills/<slug>/experience.yml`    | Per-skill lessons: best_practices / anti_patterns / failure_stories.                    |
| `ui_discovery/<ticket>.yml`       | Turn-1 Discovery Form mirrors (V27.9 §14, Sprint 6).                                    |
| `concept_graphs/`                 | Sprint 8 onward — 4-level Concept Graph snapshots.                                      |
| `golden_dataset/`                 | Sprint 14 — known-bad evaluator regression cases.                                       |
| `benchmarks/`                     | Sprint 14 — SWE-bench Lite/Verified + WebArena baselines + results.                     |
| `meta_evolution/`                 | Sprint 17 — DiagnosisReport / diffs / test_log per Meta-Evolution run.                  |
| `rfc/`                            | Sprint 17 — Synthesizer RFCs awaiting Exec Board review.                                |
| `horizon_rfcs/`                   | Sprint 18 — Horizon Scanner Evolution RFCs.                                             |

## Rules

- **Never** modify `CORE_VALUES.yml` or `DESIGN.md` without an ADR + Human Tech Lead approval.
- **Always** tag new EXPERIENCE / experience.yml entries with a Veracity tag (`human-authored`,
  `human-approved`, or `ai-only`). Agents default to `ai-only`; only humans promote.
- **Never** delete an ADR. Mark it `Status: Superseded by ADR-XXXX` instead.
- **Always** regenerate `.backend/<workspace>/` via `pnpm model-transfer` after changes here. The
  derived workspace is NOT committed; it is rebuilt from this tree on demand without an LLM call.

## Verify locally

```sh
pnpm knowledge-audit         # per-skill Veracity audit
pnpm model-transfer          # rebuild .backend/default/ (zero LLM)
```
