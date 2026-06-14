# ARIA-V1 — Open Questions

This file tracks design questions that were intentionally deferred during planning.
Each entry has a status so it is easy to pick up later.

---

## OQ-001 — CFO / Marketing / Business Analytics agent behaviour

**Status:** Deferred — to be answered before these roles are activated  
**Raised:** 2026-06-14  
**Context:** During the team-genesis design session the question of what CFO, Marketing, and
Business Analytics agents should *actually do* inside an ARIA session was intentionally skipped.
These roles are currently **not auto-generated** by the SkillFactory; they are listed as
`future` candidates in `HIGHER_ARCH_ALWAYS_PRESENT` but gated behind the `OQ-001` flag.

**Questions to answer:**
1. What concrete actions should the CFO agent take during a sprint session?
   - Options considered: monitor token/compute cost per sprint, flag over-budget agents,
     produce a cost report at sprint close.
2. What should the Marketing agent produce?
   - Options: auto-draft release notes from merged PRs, write changelog entries,
     produce product-announcement copy for new features.
3. What should the Business Analytics agent do?
   - Options: query ticket velocity, burn-rate, cycle time, produce a sprint health dashboard.
4. Should these three roles be always present (like the C-suite), or only for projects
   that look like a customer-facing product (has a frontend, pricing page, etc.)?

**Decision needed by:** Before v1 public launch  
**Owner:** TBD

---

## OQ-002 — Agent idle behaviour

**Status:** Deferred  
**Raised:** 2026-06-14  
**Context:** The `idle_mode` enum on skills has values `learning | creative | reflection | off`
but no service currently drives what agents do when idle.

**Questions to answer:**
1. Should idle agents autonomously browse their owned repo paths and surface observations?
2. Should `creative` mode allow agents to propose unprompted feature ideas?
3. Who can change an agent's idle mode — only the workspace owner, or any team member?

---

_Add new entries below using the `OQ-NNN` prefix format._
