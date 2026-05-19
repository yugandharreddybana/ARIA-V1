# frontend-web — persona EXPERIENCE.md

> Lessons specific to the Frontend Web Specialist persona. See `EXPERIENCE.md` for
> cross-cutting lessons.

## Lessons

- **React Flow named import (`6bb12b2`).** `import ReactFlow from '@xyflow/react'` fails;
  must use the named import. *veracity: human-authored*

- **Dashboard fan-out uses `allSettled`.** Documented in cross-cutting EXPERIENCE.md.
  *veracity: human-authored*

- **Select primitive (`Sprint 5`).** Use the in-repo `@/components/ui/select`. Do not pull
  Radix Select directly — keeps the bundle small and gives accessibility for free.
  *veracity: human-approved*

- **Sidebar status (`Sprint 5`).** `<SessionStatus />` must mount in the dashboard layout,
  never in individual pages. *veracity: human-approved*

## Anti-patterns

- Inline `#hex` colours in JSX (`Anti-Slop P0`).
- `console.log` shipped to main (`Anti-Slop P0`).
- TODO / FIXME markers in committed code (`Anti-Slop P0`).
- Horizontal scroll on mobile 375 px (`DESIGN.md` hard rule).
