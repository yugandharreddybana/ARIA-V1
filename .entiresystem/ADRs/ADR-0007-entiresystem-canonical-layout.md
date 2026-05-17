# ADR-0007 — `.entiresystem/` canonical store layout

**Status:** Accepted (Sprint 7)
**Date:** 2026-05-16

## Context
V27.9 §2.2 + §6 define `.entiresystem/` as the single canonical knowledge store. It must be human-readable,
git-tracked, and FIM-signed. Sprint 6 fixed the gitignore so the directory is now committed; Sprint 7
locks down the layout.

## Decision
The canonical layout (root: `<repo>/.entiresystem/`):

```
.entiresystem/
├── .gitignore                  # only excludes generated indexes (embeddings/, */temp/)
├── CORE_VALUES.yml             # FIM-signed, read-only after Sprint 7 lock-in
├── DESIGN.md                   # FIM-signed, read-only after Sprint 7 lock-in
├── DOMAIN_BOUNDARIES.json      # FIM-signed
├── SKILL.md                    # FIM-signed — top-level skill index
├── fim_registry.json           # signed hashes for the four files above
├── keys/
│   └── daemon.pub              # Ed25519 public key (private key in .aria/keys/, gitignored)
├── ADRs/                       # ADR-NNNN-<short>.md, append-only
├── EXPERIENCE/                 # general + per-persona EXPERIENCE.md
├── ANTI_PATTERNS/              # per-domain anti-pattern catalogues
├── skills/
│   └── <slug>/
│       ├── SKILL.md            # frontmatter + body + Transparency Card (V27.9 §9)
│       └── experience.yml      # skill-specific lessons (ADR-0008 veracity)
├── ui_discovery/               # Turn-1 Discovery Form YAML mirrors (V27.9 §14)
├── concept_graphs/             # Sprint 8 onward
├── golden_dataset/             # Sprint 14 onward
├── benchmarks/                 # Sprint 14 onward
├── meta_evolution/             # Sprint 17 onward
├── rfc/                        # Synthesizer Agent RFC drafts (Sprint 17)
└── horizon_rfcs/               # Horizon Scanner Evolution RFCs (Sprint 18)
```

Derived artefacts live in `<repo>/.backend/<workspace>/` (gitignored under `.aria/` rules; rebuilt by
`/model-transfer`).

Daemon-private runtime lives in `<repo>/.aria/` (private keys, hydration cache, replay DB, seed vault).

## Consequences
+ Reviewers see every lesson, ADR, SKILL, and stage-gate decision through standard `git log`/`git diff`.
+ FIM detects unauthorized edits to the four protected brain files immediately.
+ Meta-Evolution (Sprint 17) has a single tree to scan; cannot accidentally touch ADRs or CORE_VALUES.
− One canonical layout means future restructures need an ADR amendment.
