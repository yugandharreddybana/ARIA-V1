# ux — ANTI_PATTERNS.md

## Forbidden patterns

- **Inline `#hex` colours.** Use Tailwind tokens / `aria-*` palette only (Anti-Slop P0).
- **Fixed pixel widths ≥ 100 px.** Causes horizontal scroll on mobile 375 px (Anti-Slop P0).
- **TODO / FIXME / XXX markers in committed code.** Open a ticket, don't leave a marker.
- **`console.log` in shipped code.** Use Winston / Logback structured logging.
- **`as any` casts.** Anti-Slop P2 — escalate to a typed solution.
- **Multiple competing shadow utilities on the same element.** Anti-Slop P1.
- **No focus ring on interactive elements.** Hard a11y fail.
- **Marketing copy on internal/admin surfaces.** Voice is direct + technical + lowercase
  logging (DESIGN.md).
