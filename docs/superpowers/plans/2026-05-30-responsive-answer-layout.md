# Responsive Answer Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On wide/landscape viewports, lay the playing screen out as card-on-left + answer-options-in-a-column-on-the-right; portrait phones keep the current bottom-sheet.

**Architecture:** A `useWideLayout()` hook (matchMedia `(min-width: 900px), (orientation: landscape)`) returns a boolean that `App` reads. `App` passes it to `CardStage` (anchors/caps the card on the left in wide mode) and chooses between the existing bottom-sheet and a new right-hand `.side-panel`; `NameChoice` gains a `layout` prop for 2×2 vs single-column. No engine/scoring changes (#1 already handled by the per-round shuffle + sub-project A).

**Tech Stack:** React, TypeScript, Vite, Zustand, framer-motion, Vitest + Testing Library.

**Reference spec:** `docs/superpowers/specs/2026-05-30-responsive-answer-layout-design.md`

---

## File structure

| File | Responsibility |
|------|----------------|
| `src/ui/useWideLayout.ts` (create) | matchMedia-backed boolean hook for the side-by-side layout |
| `src/ui/useWideLayout.test.ts` (create) | Unit tests (mocked matchMedia + change event) |
| `src/ui/NameChoice.tsx` (modify) | Add `layout: 'grid' \| 'column'` prop |
| `src/ui/NameChoice.test.tsx` (create) | Renders 4 options in both layouts |
| `src/scene/CardStage.tsx` (modify) | Accept `wide` prop; anchor + cap card on the left in wide mode |
| `src/App.tsx` (modify) | Use the hook; `data-wide`; pass `wide`; branch bottom-sheet vs side-panel |
| `src/index.css` (modify) | Add `.side-panel` |

---

## Task 1: `useWideLayout` hook

**Files:**
- Create: `src/ui/useWideLayout.ts`
- Test: `src/ui/useWideLayout.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/ui/useWideLayout.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWideLayout } from './useWideLayout';

type Listener = () => void;

function mockMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<Listener>();
  const mql = {
    get matches() {
      return matches;
    },
    media: '',
    addEventListener: (_: string, cb: Listener) => listeners.add(cb),
    removeEventListener: (_: string, cb: Listener) => listeners.delete(cb),
  };
  const fn = vi.fn().mockReturnValue(mql);
  // @ts-expect-error test shim
  window.matchMedia = fn;
  return {
    fn,
    set(next: boolean) {
      matches = next;
      listeners.forEach((cb) => cb());
    },
    listenerCount: () => listeners.size,
  };
}

describe('useWideLayout', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('returns the initial matchMedia value', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useWideLayout());
    expect(result.current).toBe(true);
  });

  it('updates when the media query changes', () => {
    const mm = mockMatchMedia(false);
    const { result } = renderHook(() => useWideLayout());
    expect(result.current).toBe(false);
    act(() => mm.set(true));
    expect(result.current).toBe(true);
  });

  it('removes its listener on unmount', () => {
    const mm = mockMatchMedia(false);
    const { unmount } = renderHook(() => useWideLayout());
    expect(mm.listenerCount()).toBe(1);
    unmount();
    expect(mm.listenerCount()).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/useWideLayout.test.ts`
Expected: FAIL — cannot resolve `./useWideLayout`.

- [ ] **Step 3: Implement the hook**

Create `src/ui/useWideLayout.ts`:

```ts
import { useEffect, useState } from 'react';

// Side-by-side (card-left, options-right) when the viewport is wide OR landscape.
const QUERY = '(min-width: 900px), (orientation: landscape)';

function read(): boolean {
  return typeof window !== 'undefined' && 'matchMedia' in window
    ? window.matchMedia(QUERY).matches
    : false;
}

/** True when the playing screen should use the side-by-side layout. */
export function useWideLayout(): boolean {
  const [wide, setWide] = useState(read);

  useEffect(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return;
    const mql = window.matchMedia(QUERY);
    const onChange = () => setWide(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return wide;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/ui/useWideLayout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/useWideLayout.ts src/ui/useWideLayout.test.ts
git commit -m "feat: add useWideLayout hook for side-by-side layout"
```

---

## Task 2: `NameChoice` layout prop

**Files:**
- Modify: `src/ui/NameChoice.tsx`
- Test: `src/ui/NameChoice.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/ui/NameChoice.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NameChoice } from './NameChoice';
import { useGameStore } from '../state/gameStore';
import type { ScryfallCard } from '../scryfall/types';

const card = (name: string): ScryfallCard => ({
  id: name,
  name,
  cmc: 1,
  type_line: 'Instant',
  image_uris: { normal: 'n.jpg', art_crop: 'a.jpg' },
});

function seedRound() {
  useGameStore.setState({
    round: {
      target: card('Lightning Bolt'),
      options: ['Lightning Bolt', 'Counterspell', 'Llanowar Elves', 'Shock'],
      startedAt: 0,
      status: 'playing',
      guess: null,
      score: 0,
    },
  });
}

describe('NameChoice', () => {
  beforeEach(() => seedRound());

  it('renders all four options in grid layout (default)', () => {
    const { container } = render(<NameChoice />);
    expect(screen.getAllByTestId('name-option')).toHaveLength(4);
    const grid = container.firstChild as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe('1fr 1fr');
  });

  it('renders a single column in column layout', () => {
    const { container } = render(<NameChoice layout="column" />);
    expect(screen.getAllByTestId('name-option')).toHaveLength(4);
    const grid = container.firstChild as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe('1fr');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/NameChoice.test.tsx`
Expected: FAIL — `layout` prop not supported / column test fails (still `1fr 1fr`).

- [ ] **Step 3: Implement the prop**

In `src/ui/NameChoice.tsx`, change the component signature and the grid template.

Replace:
```tsx
export function NameChoice() {
  const round = useGameStore((s) => s.round);
  const guessName = useGameStore((s) => s.guessName);

  if (!round) return null;

  const resolved = round.status !== 'playing';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}
    >
```
with:
```tsx
export function NameChoice({ layout = 'grid' }: { layout?: 'grid' | 'column' }) {
  const round = useGameStore((s) => s.round);
  const guessName = useGameStore((s) => s.guessName);

  if (!round) return null;

  const resolved = round.status !== 'playing';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        display: 'grid',
        gridTemplateColumns: layout === 'column' ? '1fr' : '1fr 1fr',
        gap: 10,
      }}
    >
```

(The rest of the component — option mapping, styles, `data-testid`/`data-state` — is unchanged.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/ui/NameChoice.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/NameChoice.tsx src/ui/NameChoice.test.tsx
git commit -m "feat: add layout prop to NameChoice (grid vs column)"
```

---

## Task 3: `CardStage` wide-mode positioning

**Files:**
- Modify: `src/scene/CardStage.tsx`

- [ ] **Step 1: Accept the `wide` prop and compute wrapper/card styles**

In `src/scene/CardStage.tsx`, change the signature and derive layout-specific
styles. Replace the component signature line:
```tsx
export function CardStage({ stage }: { stage: RevealStage }) {
  const round = useGameStore((s) => s.round);
  if (!round) return null;
```
with:
```tsx
export function CardStage({ stage, wide = false }: { stage: RevealStage; wide?: boolean }) {
  const round = useGameStore((s) => s.round);
  if (!round) return null;
```

Then, just before the `return (`, add the layout-specific style objects:
```tsx
  // Portrait: card centered, sized to leave room for the bottom-sheet.
  // Wide: card anchored left, width-capped so it never overlaps the side panel.
  const wrapper: CSSProperties = wide
    ? { ...wrapperStyle, justifyContent: 'flex-start', padding: '0 0 0 4vw' }
    : wrapperStyle;
  const card: CSSProperties = wide
    ? {
        ...cardStyle,
        height: 'auto',
        width: 'min(46vw, calc(86vh * 488 / 680))',
        maxWidth: 'none',
      }
    : cardStyle;
```

- [ ] **Step 2: Use the computed styles in the JSX**

In the same file, replace the wrapper/card `<div>` opening:
```tsx
  return (
    <div style={wrapperStyle}>
      <div
        style={{
          ...cardStyle,
          boxShadow: `0 18px 40px rgba(0,0,0,0.6), 0 0 ${over ? 48 : 26}px ${glow}`,
          transition: 'box-shadow 0.6s ease',
        }}
      >
```
with:
```tsx
  return (
    <div style={wrapper}>
      <div
        style={{
          ...card,
          boxShadow: `0 18px 40px rgba(0,0,0,0.6), 0 0 ${over ? 48 : 26}px ${glow}`,
          transition: 'box-shadow 0.6s ease',
        }}
      >
```

Also update the early empty-state return to use the same wrapper. Replace:
```tsx
  if (!cardUrl) return <div style={wrapperStyle} />;
```
with:
```tsx
  if (!cardUrl) return <div style={wide ? { ...wrapperStyle, justifyContent: 'flex-start', padding: '0 0 0 4vw' } : wrapperStyle} />;
```

- [ ] **Step 3: Verify build + existing CardStage behavior**

Run: `npm run build`
Expected: clean (tsc + vite). Portrait path is byte-for-byte equivalent (`wide`
defaults to `false`, styles fall through to the originals).

- [ ] **Step 4: Commit**

```bash
git add src/scene/CardStage.tsx
git commit -m "feat: anchor and cap card on the left in wide layout"
```

---

## Task 4: `.side-panel` styles

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Add the side-panel class**

Append to `src/index.css` (after `.bottom-sheet`):

```css
/* Wide / landscape: answer options live in a right-hand column beside the card
   instead of the bottom-sheet. Vertically centered, same blurred scrim. */
.side-panel {
  pointer-events: all;
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  width: min(42vw, 460px);
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 14px;
  padding: 24px calc(20px + env(safe-area-inset-right)) 24px 18px;
  background: linear-gradient(90deg, rgba(13, 11, 19, 0) 0%, rgba(7, 6, 10, 0.92) 36%);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "style: add .side-panel for wide-layout answer column"
```

---

## Task 5: Wire `App` to the responsive layout

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Import the hook**

In `src/App.tsx`, add to the imports (near the other `./ui/*` imports):
```tsx
import { useWideLayout } from './ui/useWideLayout';
```

- [ ] **Step 2: Read the hook and tag the root**

In the `App` component, after the other `useGameStore` selectors and clock hooks,
add:
```tsx
  const wide = useWideLayout();
```

Change the root element opening from:
```tsx
  return (
    <div className="stage-root">
```
to:
```tsx
  return (
    <div className="stage-root" data-wide={wide}>
```

- [ ] **Step 3: Pass `wide` to CardStage**

Change:
```tsx
      {round && <CardStage stage={playingNow ? stage : 5} />}
```
to:
```tsx
      {round && <CardStage stage={playingNow ? stage : 5} wide={wide} />}
```

- [ ] **Step 4: Branch the playing options container**

Replace the playing-phase block:
```tsx
          {phase === 'playing' && round && (
            <motion.div
              key="playing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ display: 'flex', flexDirection: 'column', height: '100%', pointerEvents: 'none' }}
            >
              <div style={{ pointerEvents: 'all' }}>
                <HUD timeLeftMs={timeLeftMs} />
              </div>
              <div style={{ flex: 1 }} />
              <div className="bottom-sheet" style={{ pointerEvents: 'all', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {playingNow && <Timer elapsedMs={elapsedMs} />}
                <NameChoice />
              </div>
            </motion.div>
          )}
```
with:
```tsx
          {phase === 'playing' && round && (
            <motion.div
              key="playing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ display: 'flex', flexDirection: 'column', height: '100%', pointerEvents: 'none' }}
            >
              <div style={{ pointerEvents: 'all' }}>
                <HUD timeLeftMs={timeLeftMs} />
              </div>
              <div style={{ flex: 1 }} />
              {wide ? (
                <div className="side-panel">
                  {playingNow && <Timer elapsedMs={elapsedMs} />}
                  <NameChoice layout="column" />
                </div>
              ) : (
                <div className="bottom-sheet" style={{ pointerEvents: 'all', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {playingNow && <Timer elapsedMs={elapsedMs} />}
                  <NameChoice />
                </div>
              )}
            </motion.div>
          )}
```

- [ ] **Step 2.5 note:** the `.overlay` wrapper uses `justify-content: space-between`;
the absolute `.side-panel` is positioned independently of that flow, so the
HUD/spacer structure is harmless in wide mode (the spacer just fills height).

- [ ] **Step 5: Run full tests + build**

Run: `npm test && npm run build`
Expected: PASS — all existing tests green, new tests green, `tsc -b` clean.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: switch playing screen to side-by-side layout when wide"
```

---

## Task 6: Browser verification (eyeball real pixels)

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (or the preview tool). Expected: serves with no console errors.

- [ ] **Step 2: Verify all three layouts render**

In the browser (use preview/screenshot — eyeball actual pixels, not mocks):
- **Desktop (wide window):** start a game → card on the **left**, timer + a
  **vertical column of 4** options on the **right**; play and resolve a round
  (correct = green, wrong = red, others dim).
- **Landscape phone (e.g. 844×390):** same side-by-side layout, card not
  overlapping the options column.
- **Portrait phone (e.g. 390×844):** unchanged bottom-sheet with 2×2 options.
- **Live flip:** resize/rotate across the breakpoint and confirm the layout
  switches without reload and the round stays playable.

Expected: all pass; no console errors; options remain tappable in every layout.

- [ ] **Step 3: Final commit if any tweaks were needed**

Only if Step 2 surfaced fixes; otherwise nothing to commit.

---

## Self-review notes

- **Spec coverage:** #3 side-by-side (Tasks 3–5); trigger = wide OR landscape
  (Task 1 hook); vertical column of 4 (Task 2 + Task 5 `layout="column"`); #1
  explicitly out of scope (already handled by A + per-round shuffle).
- **Type consistency:** `useWideLayout(): boolean` (Task 1) → `wide` prop on
  `CardStage` (Task 3) and `data-wide` / branch in `App` (Task 5); `NameChoice`
  `layout?: 'grid' | 'column'` (Task 2) used as `layout="column"` (Task 5).
- **No engine changes:** scoring, reveal stages, option generation untouched.
- **Out of scope:** start/game-over layouts, sub-projects A & C.
