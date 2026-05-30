# Responsive Answer Layout — Design

**Date:** 2026-05-30
**Status:** Approved (design)
**Sub-project:** B of 3 (see card-data-backend spec's "Scope & decomposition")

## Problem

Two tester-feedback items concern the gameplay answer options:

- **#1** "Answer options are always in the same position" — memorization gets too
  easy.
- **#3** On PC / landscape, show the answer options stacked to the **right** of
  the card (side-by-side) instead of below it.

**#1 is already addressed.** Options are reshuffled every round
(`shuffle([target.name, ...picked])` in `planGame`/`buildOptions`), and the real
"too easy" driver — a small recurring pool — was fixed by sub-project A (top-1000
popular pool + fresh cards each game). So B does **no engine work** for #1.

This spec therefore covers **#3 only**: a responsive playing-screen layout.

## Current layout

Mobile-portrait only, no media queries:

- `CardStage` centers the card in the full viewport via an inline-styled wrapper
  (`height: min(66vh, 132vw)`, `maxWidth: 94vw`).
- The playing overlay pins a `.bottom-sheet` to the bottom holding the `Timer`
  above a 2×2 `NameChoice` grid (`gridTemplateColumns: '1fr 1fr'`).
- The HUD (time / correct / score) sits top-right; a home button sits top-left.

## Decisions (confirmed with user)

- **Trigger:** switch to side-by-side when the viewport is **wide OR landscape** —
  `matchMedia('(min-width: 900px), (orientation: landscape)')` (comma = OR).
  Portrait phones keep the bottom-sheet.
- **Right-side arrangement:** a **vertical column of 4** full-width option
  buttons, with the timer above them.
- **#1:** already covered by A + the existing per-round shuffle — no extra work.

## Approach

A small layout hook drives a boolean that both the card and the options panel
read, so the two halves stay coordinated.

### New: `src/ui/useWideLayout.ts`

```ts
import { useEffect, useState } from 'react';

const QUERY = '(min-width: 900px), (orientation: landscape)';

/** True when the playing screen should use the side-by-side (card-left,
 *  options-right) layout. Tracks viewport changes via matchMedia. */
export function useWideLayout(): boolean {
  const [wide, setWide] = useState(() =>
    typeof window !== 'undefined' && 'matchMedia' in window
      ? window.matchMedia(QUERY).matches
      : false,
  );
  useEffect(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return;
    const mql = window.matchMedia(QUERY);
    const onChange = () => setWide(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return wide;
}
```

### `App.tsx`

- Call `const wide = useWideLayout();`.
- Add `data-wide={wide}` to the `.stage-root` element (available for CSS hooks).
- Pass `wide` to `CardStage` (`<CardStage stage={…} wide={wide} />`).
- In the **playing** phase only, branch the options container:
  - **portrait (`!wide`):** unchanged — bottom-sheet with `Timer` + `NameChoice`
    (grid).
  - **wide:** a right-hand `.side-panel` (absolutely positioned, vertically
    centered) holding `Timer` above `NameChoice` (column).
- Idle / loading / error / gameover phases are unchanged.

### `CardStage.tsx`

- Accept an optional `wide?: boolean` prop (default `false`).
- In wide mode, change the wrapper so the card is anchored toward the **left**
  and capped in width so it never overlaps the right panel:
  - wrapper: `justifyContent: 'flex-start'`, left/right padding so the card sits
    in roughly the left ~55% (e.g. `padding: '0 0 0 4vw'`, and the card width cap
    below keeps it clear of the panel).
  - card: `width: 'min(46vw, 62vh * 488/680)'`, drop the portrait
    `height/maxWidth` caps in wide mode (use `height: auto` with the aspect-ratio
    box driven by width). Portrait styles are untouched.
- All blur/mask overlays are positioned in percentages relative to the card box,
  so they continue to work unchanged at any card size.

### `NameChoice.tsx`

- Accept `layout?: 'grid' | 'column'` (default `'grid'`).
- `grid` → `gridTemplateColumns: '1fr 1fr'` (today's 2×2).
- `column` → `gridTemplateColumns: '1fr'` (single column of 4).
- Win/lose/dim colour states and the `data-testid="name-option"` / `data-state`
  attributes are unchanged.

### `index.css`

- Add `.side-panel`: absolutely positioned on the right (`top/bottom: 0`,
  `right: 0`, `width: min(42vw, 460px)`), flex column centered vertically, with
  the same blurred scrim treatment as `.bottom-sheet`, and
  `padding` that respects `env(safe-area-inset-*)`.
- Keep `.bottom-sheet` as-is for portrait.

## Out of scope

- Start screen and game-over screen layouts (the feedback is about *gameplay*
  answer options). They keep their current presentation.
- Any change to scoring, reveal stages, the HUD, or option generation.
- Sub-projects A (done) and C (leaderboard time windows).

## Testing

- **Unit:** `useWideLayout` with a mocked `matchMedia` (initial match + a
  `change` event flips the value; listener is removed on unmount). `NameChoice`
  renders all 4 options in both `grid` and `column` layouts.
- **Browser (eyeball real pixels):** verify the playing screen at three sizes —
  portrait phone (bottom-sheet), landscape phone, and desktop (card-left,
  options-column-right) — and that resizing/rotating flips the layout live and a
  round still plays. No mocked-only sign-off.

## Risks / notes

- Very short landscape phones get a small card (`62vh` cap) — acceptable; the
  options column remains fully usable.
- `matchMedia('change')` is supported in all current target browsers; the hook
  falls back to `false` (portrait) when `matchMedia` is unavailable (SSR/tests).
