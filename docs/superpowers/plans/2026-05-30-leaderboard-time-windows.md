# Leaderboard Time Windows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Today / Weekly / All-time sub-tabs (Today default) to the start-screen leaderboard's global (All Cards / Popular) tabs, filtering by score `created_at`.

**Architecture:** A pure `windowCutoff(window)` helper yields an epoch-ms cutoff; `fetchTopScores` gains an optional `since` arg that adds a `created_at` predicate to the existing `leaderboard_top` view query; `useLeaderboard` takes a `TimeWindow` and computes the cutoff; `Leaderboard.tsx` renders a second tab strip for the windows. Client-only — no DB changes.

**Tech Stack:** React, TypeScript, Zustand, Supabase JS, Vitest + Testing Library.

**Reference spec:** `docs/superpowers/specs/2026-05-30-leaderboard-time-windows-design.md`

---

## File structure

| File | Responsibility |
|------|----------------|
| `src/leaderboard/window.ts` (create) | `TimeWindow`, `windowCutoff`, `WINDOW_TABS` |
| `src/leaderboard/window.test.ts` (create) | Unit tests for `windowCutoff` |
| `src/leaderboard/client.ts` (modify) | `fetchTopScores` accepts `since` |
| `src/leaderboard/client.test.ts` (modify) | Assert `created_at` filter when `since` set |
| `src/leaderboard/useLeaderboard.ts` (modify) | Accept `window`, compute `since` |
| `src/ui/Leaderboard.tsx` (modify) | Window sub-tab strip on global tabs |
| `src/ui/Leaderboard.test.tsx` (modify) | Window tests + update call-arg assertions |

---

## Task 1: `windowCutoff` helper

**Files:**
- Create: `src/leaderboard/window.ts`
- Test: `src/leaderboard/window.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/leaderboard/window.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { windowCutoff, WINDOW_TABS } from './window';

const NOW = 1_000_000_000_000;
const DAY = 86_400_000;

describe('windowCutoff', () => {
  it('today = now minus 24h', () => {
    expect(windowCutoff('today', NOW)).toBe(NOW - DAY);
  });
  it('week = now minus 7 days', () => {
    expect(windowCutoff('week', NOW)).toBe(NOW - 7 * DAY);
  });
  it('all = null (no time filter)', () => {
    expect(windowCutoff('all', NOW)).toBeNull();
  });
});

describe('WINDOW_TABS', () => {
  it('lists today, week, all in order', () => {
    expect(WINDOW_TABS.map((t) => t.key)).toEqual(['today', 'week', 'all']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/leaderboard/window.test.ts`
Expected: FAIL — cannot resolve `./window`.

- [ ] **Step 3: Implement the helper**

Create `src/leaderboard/window.ts`:

```ts
export type TimeWindow = 'today' | 'week' | 'all';

const DAY_MS = 86_400_000;

/** Epoch-ms cutoff for a window, or null for all-time. Rolling from `now`. */
export function windowCutoff(window: TimeWindow, now: number = Date.now()): number | null {
  if (window === 'today') return now - DAY_MS;
  if (window === 'week') return now - 7 * DAY_MS;
  return null;
}

export const WINDOW_TABS: { key: TimeWindow; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Weekly' },
  { key: 'all', label: 'All-time' },
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/leaderboard/window.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/leaderboard/window.ts src/leaderboard/window.test.ts
git commit -m "feat: add leaderboard time-window cutoff helper"
```

---

## Task 2: `fetchTopScores` time filter

**Files:**
- Modify: `src/leaderboard/client.ts`
- Test: `src/leaderboard/client.test.ts`

- [ ] **Step 1: Add `gte` to the test query stub and write the failing test**

In `src/leaderboard/client.test.ts`, add `'gte'` to the chainable method list:
```ts
  for (const m of ['select', 'eq', 'gt', 'gte', 'order', 'limit']) {
```
Then add this test inside the `describe('fetchTopScores', …)` block:
```ts
  it('adds a created_at filter when since is provided', async () => {
    const q = query({ data: [], error: null });
    from.mockReturnValueOnce(q);
    const { fetchTopScores } = await importClient();
    await fetchTopScores('all', 5, 1_700_000_000_000);
    expect(q.gte).toHaveBeenCalledWith('created_at', new Date(1_700_000_000_000).toISOString());
  });

  it('omits the created_at filter when since is null', async () => {
    const q = query({ data: [], error: null });
    from.mockReturnValueOnce(q);
    const { fetchTopScores } = await importClient();
    await fetchTopScores('all', 5, null);
    expect(q.gte).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/leaderboard/client.test.ts`
Expected: FAIL — `gte` never called (filter not implemented).

- [ ] **Step 3: Implement the filter**

In `src/leaderboard/client.ts`, replace the current `fetchTopScores`:
```ts
export async function fetchTopScores(pool: PoolKind, limit = 5): Promise<GlobalEntry[]> {
  const c = getSupabase();
  if (!c) return [];
  const { data, error } = await c
    .from('leaderboard_top')
    .select('id,name,score,correct,pool,country,created_at')
    .eq('pool', pool)
    .order('score', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(toEntry);
}
```
with:
```ts
export async function fetchTopScores(
  pool: PoolKind,
  limit = 5,
  since: number | null = null,
): Promise<GlobalEntry[]> {
  const c = getSupabase();
  if (!c) return [];
  let q = c
    .from('leaderboard_top')
    .select('id,name,score,correct,pool,country,created_at')
    .eq('pool', pool);
  if (since != null) q = q.gte('created_at', new Date(since).toISOString());
  const { data, error } = await q
    .order('score', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(toEntry);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/leaderboard/client.test.ts`
Expected: PASS (new + existing tests green).

- [ ] **Step 5: Commit**

```bash
git add src/leaderboard/client.ts src/leaderboard/client.test.ts
git commit -m "feat: add since (created_at) filter to fetchTopScores"
```

---

## Task 3: `useLeaderboard` window param

**Files:**
- Modify: `src/leaderboard/useLeaderboard.ts`

- [ ] **Step 1: Thread the window through to the cutoff**

Replace the full contents of `src/leaderboard/useLeaderboard.ts`:
```ts
import { useCallback, useEffect, useState } from 'react';
import type { PoolKind } from '../state/highscores';
import type { GlobalEntry } from './types';
import { fetchTopScores } from './client';
import { windowCutoff, type TimeWindow } from './window';

export function useLeaderboard(pool: PoolKind, limit: number, window: TimeWindow = 'all') {
  const [entries, setEntries] = useState<GlobalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const reload = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchTopScores(pool, limit, windowCutoff(window))
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pool, limit, window]);

  useEffect(() => reload(), [reload]);

  return { entries, loading, error, reload };
}
```

- [ ] **Step 2: Verify build (types)**

Run: `npm run build`
Expected: clean (the only caller, `Leaderboard.tsx`, still type-checks — `window`
defaults to `'all'`; it gets a value in Task 4).

- [ ] **Step 3: Commit**

```bash
git add src/leaderboard/useLeaderboard.ts
git commit -m "feat: add time-window param to useLeaderboard"
```

---

## Task 4: Window sub-tabs in `Leaderboard`

**Files:**
- Modify: `src/ui/Leaderboard.tsx`
- Test: `src/ui/Leaderboard.test.tsx`

- [ ] **Step 1: Update existing call-arg assertions + add window tests**

In `src/ui/Leaderboard.test.tsx`:

Change the default-tab assertion:
```ts
    expect(spy).toHaveBeenCalledWith('all', 11);
```
to:
```ts
    expect(spy).toHaveBeenCalledWith('all', 11, expect.any(Number));
```

Change the expand assertion:
```ts
    await waitFor(() => expect(spy).toHaveBeenCalledWith('all', 100));
```
to:
```ts
    await waitFor(() => expect(spy).toHaveBeenCalledWith('all', 100, expect.any(Number));
```

Then add these tests inside `describe('Leaderboard', …)`:
```ts
  it('shows window sub-tabs with Today selected by default', async () => {
    vi.spyOn(client, 'fetchTopScores').mockResolvedValue([entry]);
    render(<Leaderboard />);
    await waitFor(() => expect(screen.getByText('Al')).toBeInTheDocument());
    expect(screen.getByRole('tab', { name: /today/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /weekly/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /all-time/i })).toBeInTheDocument();
  });

  it('selecting All-time queries with a null since', async () => {
    const spy = vi.spyOn(client, 'fetchTopScores').mockResolvedValue([entry]);
    render(<Leaderboard />);
    await waitFor(() => expect(screen.getByText('Al')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: /all-time/i }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith('all', 11, null));
  });

  it('hides the window sub-tabs on the Me tab', async () => {
    vi.spyOn(client, 'fetchTopScores').mockResolvedValue([]);
    localStorage.setItem(
      'guessthecard.highscores.v3',
      JSON.stringify([{ score: 500, correct: 5, date: 1, pool: 'all' }]),
    );
    render(<Leaderboard />);
    fireEvent.click(screen.getByRole('tab', { name: /^me$/i }));
    await waitFor(() => expect(screen.getByTestId('highscore-list')).toBeInTheDocument());
    expect(screen.queryByRole('tab', { name: /today/i })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/Leaderboard.test.tsx`
Expected: FAIL — no window sub-tabs yet; call-arg assertions expect a 3rd arg.

- [ ] **Step 3: Implement the window strip**

In `src/ui/Leaderboard.tsx`:

Add the import:
```tsx
import { WINDOW_TABS, type TimeWindow } from '../leaderboard/window';
```

Add window state after the other `useState` calls:
```tsx
  const [win, setWin] = useState<TimeWindow>('today');
```

Pass `win` into both hooks:
```tsx
  const all = useLeaderboard('all', allExpanded ? 100 : PROBE, win);
  const popular = useLeaderboard('popular', popExpanded ? 100 : PROBE, win);
```

Render the window strip between the main tab strip and the content. Insert this
block immediately **after** the closing `</div>` of the existing main
`role="tablist"` strip and **before** the `{tab === 'all' && …}` line:
```tsx
      {tab !== 'me' && (
        <div
          role="tablist"
          aria-label="Time window"
          style={{
            display: 'flex',
            gap: 4,
            padding: 4,
            borderRadius: 10,
            border: '1px solid var(--line)',
            background: 'rgba(20,17,28,0.5)',
          }}
        >
          {WINDOW_TABS.map((w) => {
            const active = win === w.key;
            return (
              <button
                key={w.key}
                role="tab"
                aria-selected={active}
                onClick={() => setWin(w.key)}
                style={{
                  flex: 1,
                  padding: '5px 8px',
                  borderRadius: 7,
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                  background: active ? 'rgba(255,122,44,0.22)' : 'transparent',
                  color: active ? 'var(--ember-hot)' : 'var(--ink-2)',
                  fontWeight: active ? 700 : 500,
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {w.label}
              </button>
            );
          })}
        </div>
      )}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/ui/Leaderboard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full suite + build**

Run: `npm test && npm run build`
Expected: PASS — all tests green, `tsc -b` clean.

- [ ] **Step 6: Commit**

```bash
git add src/ui/Leaderboard.tsx src/ui/Leaderboard.test.tsx
git commit -m "feat: add Today/Weekly/All-time sub-tabs to the leaderboard"
```

---

## Task 5: Browser verification (eyeball real pixels)

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server / preview.** Expected: no console errors.

- [ ] **Step 2: Verify on the start screen:**
- Under **All Cards**, a window strip shows **Today / Weekly / All-time** with
  **Today** highlighted by default.
- Switching to **Weekly** and **All-time** updates the list (All-time shows the
  most rows; Today/Weekly show only recent scores — today's seed/test scores
  determine what's visible).
- The same strip appears under **Popular**.
- The **Me** tab shows **no** window strip.

Expected: all pass; no console errors.

- [ ] **Step 3: Final commit only if tweaks were needed.**

---

## Self-review notes

- **Spec coverage:** windows Today/Weekly/All-time (Task 1 + Task 4 strip),
  default Today (Task 4 `useState('today')`), rolling 24h/7d (`windowCutoff`),
  global-tabs-only (`tab !== 'me'` guard), client-only (no migration).
- **Type consistency:** `TimeWindow` defined in Task 1, consumed by
  `useLeaderboard` (Task 3) and `Leaderboard` (Task 4); `fetchTopScores`'s third
  arg `since: number | null` (Task 2) is fed by `windowCutoff(window)` (Task 3).
- **Existing-test impact:** the two `toHaveBeenCalledWith` assertions are updated
  for the new third arg (Task 4 Step 1).
- **Out of scope:** GameOverLeaderboard, local Me windowing, DB changes,
  sub-projects A & B.
