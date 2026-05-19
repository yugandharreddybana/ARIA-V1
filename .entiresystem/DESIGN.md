# DESIGN.md — ARIA Brand & UI Contract (read-only)

This document is **read-only** after Sprint 7 lock-in. Changes require an ADR + Human Tech Lead approval.

## Tokens

| Token        | Value                            | Notes                                                   |
|--------------|----------------------------------|---------------------------------------------------------|
| `background` | `hsl(222.2 84% 4.9%)`            | App background                                          |
| `foreground` | `hsl(210 40% 98%)`               | Primary text on background                              |
| `aria-500`   | `#6366f1`-class indigo accent    | Use via the Tailwind `aria-*` palette, never inline hex |
| `font-sans`  | Inter, system-ui                 | Body + UI                                               |
| `font-mono`  | JetBrains Mono, ui-monospace     | Code                                                    |

## Layout

- **Mobile-first.** Every page must render correctly at 375×667 without horizontal scroll.
- **Sidebar 240 px.** Sticky on desktop ≥768 px, hidden behind a sheet on smaller widths.
- **Content max-width 1280 px.** Centered with `mx-auto`.
- **Spacing scale:** 4, 8, 12, 16, 24, 32, 48, 64. Never hand-roll arbitrary spacing.

## Components

- Use shadcn primitives from `@/components/ui/*`. Do not import Radix Select directly; use the
  ARIA `Select` wrapper added in Sprint 5.
- Buttons always have a visible focus ring. Loading states use `Loader2` from `lucide-react`.

## Voice

- Direct, technical, lowercase logging. No marketing copy on internal surfaces.

## Anti-patterns

- Inline `#hex` colors — fail the Anti-Slop Gate (`execution/inline-hex`).
- Fixed-width pixel values ≥ 100 px — fail (`execution/fixed-px-width`).
- `console.log` left in shipped code.
- TODO / FIXME markers shipped to main.
- Horizontal scroll on mobile.
