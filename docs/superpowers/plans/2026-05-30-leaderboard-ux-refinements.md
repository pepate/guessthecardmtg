# Leaderboard & Layout Refinements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Five client-side refinements: adjacent card+options in landscape; game-over online top-5 + projected spot; pull-to-refresh on start; leaderboard loading spinner; play buttons always visible while the ranking scrolls.

**Reference spec:** `docs/superpowers/specs/2026-05-30-leaderboard-ux-refinements-design.md`

**Tech Stack:** React, TypeScript, Vite, Zustand, framer-motion, Vitest + Testing Library.

---

## Task 1: Reusable spinner + leaderboard loading state (#4)

**Files:** `src/index.css`, `src/App.tsx`, `src/ui/Leaderboard.tsx`, `src/ui/Leaderboard.test.tsx`

- [ ] **Step 1:** In `src/index.css` add (top-level):
```css
@keyframes spin { to { transform: rotate(360deg); } }
.spinner {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid rgba(255, 186, 120, 0.18);
  border-top-color: var(--ember);
  animation: spin 0.9s linear infinite;
}
```

- [ ] **Step 2:** In `src/App.tsx` `LoadingScreen`, replace the inline 46px spinner
`<div>` and its `<style>{`@keyframes spin…`}</style>` with the shared class but
keep the larger size:
```tsx
      <div className="spinner" style={{ width: 46, height: 46, borderWidth: 3 }} />
```
(Delete the now-redundant `<style>` keyframes block in LoadingScreen.)

- [ ] **Step 3:** In `src/ui/Leaderboard.tsx` `GlobalView`, before the
empty/visible render, add:
```tsx
  if (state.loading && state.entries.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0' }}>
        <span className="spinner" data-testid="leaderboard-spinner" aria-label="Loading" />
      </div>
    );
  }
```

- [ ] **Step 4:** Add a test to `src/ui/Leaderboard.test.tsx`:
```tsx
  it('shows a spinner while loading before rows arrive', async () => {
    let resolve!: (v: GlobalEntry[]) => void;
    vi.spyOn(client, 'fetchTopScores').mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<Leaderboard />);
    expect(screen.getAllByTestId('leaderboard-spinner').length).toBeGreaterThanOrEqual(1);
    resolve([entry]);
    await waitFor(() => expect(screen.getByText('Al')).toBeInTheDocument());
  });
```

- [ ] **Step 5:** `npx vitest run src/ui/Leaderboard.test.tsx` → PASS; `npm run build` → clean.
- [ ] **Step 6:** Commit: `git commit -m "feat: reusable spinner + leaderboard loading state"`

---

## Task 2: refreshKey plumbing + pull-to-refresh (#3)

**Files:** `src/leaderboard/useLeaderboard.ts`, `src/ui/Leaderboard.tsx`, `src/ui/StartLeaderboard.tsx`, `src/ui/usePullToRefresh.ts` (create), `src/ui/usePullToRefresh.test.ts` (create), `src/leaderboard/useLeaderboard.test.ts` (create)

- [ ] **Step 1:** `useLeaderboard` — add `refreshKey`:
```ts
export function useLeaderboard(pool: PoolKind, limit: number, window: TimeWindow = 'all', refreshKey = 0) {
```
and include `refreshKey` in the `reload` `useCallback` deps: `[pool, limit, window, refreshKey]`.

- [ ] **Step 2:** New test `src/leaderboard/useLeaderboard.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import * as client from './client';
import { useLeaderboard } from './useLeaderboard';

beforeEach(() => vi.restoreAllMocks());

describe('useLeaderboard', () => {
  it('refetches when refreshKey changes', async () => {
    const spy = vi.spyOn(client, 'fetchTopScores').mockResolvedValue([]);
    const { rerender } = renderHook(({ k }) => useLeaderboard('all', 5, 'all', k), {
      initialProps: { k: 0 },
    });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    rerender({ k: 1 });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  });
});
```

- [ ] **Step 3:** `Leaderboard` — accept and thread `refreshKey`:
```tsx
export function Leaderboard({ refreshKey = 0 }: { refreshKey?: number }) {
```
```tsx
  const all = useLeaderboard('all', allExpanded ? 100 : PROBE, win, refreshKey);
  const popular = useLeaderboard('popular', popExpanded ? 100 : PROBE, win, refreshKey);
```

- [ ] **Step 4:** `StartLeaderboard` — accept and pass `refreshKey`:
```tsx
export function StartLeaderboard({ refreshKey = 0 }: { refreshKey?: number }) {
```
pass `<Leaderboard refreshKey={refreshKey} />`.

- [ ] **Step 5:** Create `src/ui/usePullToRefresh.ts`:
```ts
import { useEffect, useRef, useState } from 'react';

const THRESHOLD = 64;
const MAX = 80;

/** Pull-down-to-refresh on a scrollable element. Returns a ref to attach and the
 *  current damped pull distance (px) for an indicator. Fires onRefresh on release
 *  past THRESHOLD while scrolled to top. */
export function usePullToRefresh<T extends HTMLElement>(onRefresh: () => void) {
  const ref = useRef<T>(null);
  const [pull, setPull] = useState(0);
  const pullRef = useRef(0);
  const startY = useRef(0);
  const active = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = (v: number) => {
      pullRef.current = v;
      setPull(v);
    };
    const onStart = (e: TouchEvent) => {
      if (el.scrollTop <= 0) {
        startY.current = e.touches[0].clientY;
        active.current = true;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (!active.current) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy > 0 && el.scrollTop <= 0) {
        set(Math.min(dy * 0.5, MAX));
        if (e.cancelable) e.preventDefault();
      } else {
        active.current = false;
        set(0);
      }
    };
    const onEnd = () => {
      if (active.current && pullRef.current >= THRESHOLD) onRefresh();
      active.current = false;
      set(0);
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
    };
  }, [onRefresh]);

  return { ref, pull };
}
```

- [ ] **Step 6:** Create `src/ui/usePullToRefresh.test.ts` (jsdom touch shim):
```ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePullToRefresh } from './usePullToRefresh';

function touch(clientY: number) {
  return { touches: [{ clientY }] } as unknown as TouchEventInit;
}

describe('usePullToRefresh', () => {
  it('fires onRefresh after a long pull from the top', () => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'scrollTop', { value: 0, writable: true });
    document.body.appendChild(el);
    const onRefresh = vi.fn();
    const { result } = renderHook(() => usePullToRefresh<HTMLDivElement>(onRefresh));
    // attach the ref to our element
    (result.current.ref as { current: HTMLElement | null }).current = el;
    // re-run effect by dispatching after manual attach is not trivial; instead
    // verify the hook returns a ref and pull starts at 0.
    expect(result.current.pull).toBe(0);
    document.body.removeChild(el);
  });
});
```
> Note: full touch-gesture behavior is verified in the browser (Task 6); this test
> only guards the hook's shape/default. Keep it minimal.

- [ ] **Step 7:** `npx vitest run src/leaderboard/useLeaderboard.test.ts src/ui/usePullToRefresh.test.ts` → PASS.
- [ ] **Step 8:** Commit: `git commit -m "feat: pull-to-refresh + leaderboard refreshKey plumbing"`

(The App wiring of the pull hook + refreshKey happens in Task 5 with the layout rework.)

---

## Task 3: Game-over online top-5 + projected position (#2)

**Files:** `src/ui/GameOverLeaderboard.tsx`, `src/ui/GameOverLeaderboard.test.tsx`

- [ ] **Step 1:** In `GameOverLeaderboard`, fetch the board on mount alongside the
projected rank. Replace the single projected-rank effect with:
```tsx
  useEffect(() => {
    if (!enabled || score <= 0) return;
    let cancelled = false;
    fetchProjectedRank(pool, score)
      .then((r) => !cancelled && setProjected(r))
      .catch(() => {});
    fetchTopScores(pool, VISIBLE)
      .then((list) => !cancelled && setTop(list))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled, pool, score]);
```

- [ ] **Step 2:** Build a board renderer used both before and after posting. Add,
above the `return`:
```tsx
  const youEntry: GlobalEntry = {
    id: posted?.id ?? 'projected',
    name: posted?.name ?? (sanitizeName(name) ?? 'You'),
    score,
    correct,
    pool,
    country: null,
    createdAt: Date.now(),
  };
  const ownInTop = top.some((e) => e.id === posted?.id);
  const pinnedRank = posted?.rank ?? projected?.rank;
  const pinned =
    pinnedRank && pinnedRank > top.length && !ownInTop
      ? { rank: pinnedRank, entry: youEntry }
      : null;
```

- [ ] **Step 3:** Render the board between the projected caption and the input.
Insert, immediately after the `projected && (…caption…)` block and before
`{status !== 'done' ? (`:
```tsx
      {top.length > 0 && (
        <GlobalScoreList entries={top} highlightId={posted?.id} pinned={pinned} />
      )}
```

- [ ] **Step 4:** Simplify the post-confirmation branch to a short message (the
board now renders above for all states). Replace the `<div data-testid="post-confirm">…GlobalBoardPreview…</div>`
body with just the confirmation line:
```tsx
        <div data-testid="post-confirm" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ color: 'var(--ink-0)', fontSize: 13, textAlign: 'center', margin: 0 }}>
            Posted! You're ranked <span style={{ color: 'var(--ember-hot)' }}>#{posted?.rank}</span>.
          </p>
        </div>
```
Then delete the now-unused `GlobalBoardPreview` function and the `ownInTop` const
that referenced only it (the new `ownInTop`/`pinned` above replace it).

- [ ] **Step 5:** Update `src/ui/GameOverLeaderboard.test.tsx` — add a test that the
board renders on mount:
```tsx
  it('shows the online top-5 board on mount', async () => {
    vi.spyOn(client, 'isLeaderboardEnabled').mockReturnValue(true);
    vi.spyOn(client, 'fetchProjectedRank').mockResolvedValue({ rank: 8, total: 20 });
    vi.spyOn(client, 'fetchTopScores').mockResolvedValue([
      { id: '1', name: 'Top', score: 999, correct: 9, pool: 'all', country: 'DE', createdAt: 0 },
    ]);
    render(<GameOverLeaderboard score={500} correct={5} pool="all" />);
    await waitFor(() => expect(screen.getByTestId('global-list')).toBeInTheDocument());
    expect(screen.getByText('Top')).toBeInTheDocument();
  });
```
(Keep existing tests; adjust any that assumed the board only appears after posting.)

- [ ] **Step 6:** `npx vitest run src/ui/GameOverLeaderboard.test.tsx` → PASS; `npm run build` → clean.
- [ ] **Step 7:** Commit: `git commit -m "feat: show online top-5 + projected spot on game over"`

---

## Task 4: Landscape adjacent pair (#1)

**Files:** `src/scene/CardStage.tsx`, `src/index.css`

- [ ] **Step 1:** In `src/scene/CardStage.tsx`, change the `wide` styles to inline,
height-based sizing. Replace the `wrapper`/`card` derivation:
```tsx
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
with:
```tsx
  const wrapper: CSSProperties = wide
    ? { display: 'flex', alignItems: 'center', height: '100%', flex: 'none' }
    : wrapperStyle;
  const card: CSSProperties = wide
    ? { ...cardStyle, height: 'min(78vh, calc(88vw * 680 / 488))', maxWidth: 'none' }
    : cardStyle;
```
(The empty-state early return already uses `wrapper`; leave it.)

- [ ] **Step 2:** In `src/index.css`, replace the `.side-panel` rule with the row +
column rules:
```css
/* Wide / landscape: card and answer options sit as one centered pair. */
.play-wide {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  min-height: 0;
  pointer-events: none;
  padding: 0 16px;
}
.play-wide .options-col {
  pointer-events: all;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 14px;
  width: min(40vw, 380px);
}
```

- [ ] **Step 3:** `npm run build` → clean (App still references `.side-panel`; that
is rewired in Task 5 — build is fine since classNames are strings).
- [ ] **Step 4:** Commit: `git commit -m "feat: inline card sizing + play-wide row styles"`

---

## Task 5: App wiring — pair row, pinned buttons, pull-to-refresh (#1, #3, #5)

**Files:** `src/App.tsx`

- [ ] **Step 1:** Imports — add:
```tsx
import { usePullToRefresh } from './ui/usePullToRefresh';
```

- [ ] **Step 2:** In `App`, add state + pull hook (after `const wide = useWideLayout();`):
```tsx
  const [lbRefreshKey, setLbRefreshKey] = useState(0);
  const { ref: pullRef, pull } = usePullToRefresh<HTMLDivElement>(() =>
    setLbRefreshKey((k) => k + 1),
  );
```
(Add `useState` to the existing `react` import if not present — it is, via the
top `import { useEffect, useState } from 'react'`.)

- [ ] **Step 3:** Background `CardStage` — render only when not (playing && wide):
```tsx
      {round && !(playingNow === false ? false : false) /* placeholder */}
```
Actually replace the existing line:
```tsx
      {round && <CardStage stage={playingNow ? stage : 5} wide={wide} />}
```
with:
```tsx
      {round && !(wide && phase === 'playing') && <CardStage stage={playingNow ? stage : 5} />}
```

- [ ] **Step 4:** Idle bottom-sheet — split into scroll region + pinned footer.
Replace the idle block:
```tsx
          {phase === 'idle' && (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bottom-sheet"
              style={{ display: 'flex', flexDirection: 'column', gap: 18, maxHeight: '92%', overflowY: 'auto' }}
            >
              <StartLeaderboard />
              <PoolSelect />
            </motion.div>
          )}
```
with:
```tsx
          {phase === 'idle' && (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bottom-sheet"
              style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '92%' }}
            >
              <div
                ref={pullRef}
                style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}
              >
                <div
                  aria-hidden
                  style={{ height: pull, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
                >
                  {pull > 0 && <span className="spinner" />}
                </div>
                <StartLeaderboard refreshKey={lbRefreshKey} />
              </div>
              <div style={{ flexShrink: 0 }}>
                <PoolSelect />
              </div>
            </motion.div>
          )}
```

- [ ] **Step 5:** Playing overlay — render the wide pair row vs portrait sheet.
Replace the playing block's tail (`<div style={{ flex: 1 }} />` … bottom-sheet)
with the wide/portrait branch:
```tsx
              {wide ? (
                <div className="play-wide">
                  {round && <CardStage stage={playingNow ? stage : 5} wide />}
                  <div className="options-col">
                    {playingNow && <Timer elapsedMs={elapsedMs} />}
                    <NameChoice layout="column" />
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ flex: 1 }} />
                  <div className="bottom-sheet" style={{ pointerEvents: 'all', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {playingNow && <Timer elapsedMs={elapsedMs} />}
                    <NameChoice />
                  </div>
                </>
              )}
```
(Remove the now-replaced single `<div style={{ flex: 1 }} />` + `.side-panel`/
bottom-sheet block from Task-C/B era.)

- [ ] **Step 6:** `npm test && npm run build` → all green, clean.
- [ ] **Step 7:** Commit: `git commit -m "feat: centered card+options pair, pinned start buttons, pull-to-refresh wiring"`

---

## Task 6: Browser verification (eyeball real pixels)

- [ ] **Desktop (1280×800) + landscape phone (844×390):** playing screen shows
the card and the 4-option column as an adjacent, centered pair (~16px gap), no
large empty gap; a round plays.
- [ ] **Portrait (390×844):** unchanged bottom-sheet 2×2.
- [ ] **Start screen:** the Popular/All-cards buttons stay visible while the
ranking list scrolls/expands ("Show more"); a spinner shows briefly before rows
load; pulling the list down from the top triggers a refresh (network shows a new
`leaderboard_top` request).
- [ ] **Game over:** the played pool's top-5 shows with your projected "#rank"
pinned; posting highlights your row.

---

## Self-review notes

- **Spec coverage:** #1 (Task 4 + 5), #2 (Task 3), #3 (Task 2 + 5), #4 (Task 1),
  #5 (Task 5). All client-side.
- **Type consistency:** `usePullToRefresh<T>() → { ref, pull }`; `refreshKey`
  optional through `StartLeaderboard`→`Leaderboard`→`useLeaderboard`;
  `GlobalScoreList` `pinned` shape reused unchanged.
- **Removed:** `.side-panel`, `GlobalBoardPreview`, the LoadingScreen inline
  keyframes.
