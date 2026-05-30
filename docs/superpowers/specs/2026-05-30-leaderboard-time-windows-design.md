# Leaderboard Time Windows — Design

**Date:** 2026-05-30
**Status:** Approved (design)
**Sub-project:** C of 3 (see card-data-backend spec's "Scope & decomposition")

## Problem

Tester feedback **#4:** the leaderboard should offer **Today / Weekly / All-time**
sub-tabs (Today default) under the **Popular** and **All Cards** tabs.

## Current state

- `Leaderboard.tsx` (start screen) has a tab strip: **All Cards / Popular / Me**.
  Global tabs read from Supabase via `useLeaderboard(pool, limit)` →
  `fetchTopScores(pool, limit)`; **Me** reads local highscores.
- `leaderboard_top` is a plain **view** (`migration 0001`) projecting every row
  (incl. `created_at`) with no aggregation or row cap; anon has `SELECT`.
- `GameOverLeaderboard` posts a score and shows a projected rank — inherently
  all-time (you post once against everyone).

Because the view already exposes `created_at`, a time window is just an extra
`created_at` predicate on the existing query — **no DB migration is required.**

## Decisions (confirmed with user)

- **Windows (rolling):** `Today` = scores from the last 24h; `Weekly` = last
  7 days; `All-time` = no time filter. Default = **Today**.
- **Scope:** window sub-tabs apply to the **global tabs only** (All Cards,
  Popular). The **Me** tab stays a plain all-time local list. `GameOverLeaderboard`
  is unchanged (projected rank stays all-time).

## Approach (client-only)

### New: `src/leaderboard/window.ts`

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

### `src/leaderboard/client.ts`

- `fetchTopScores(pool, limit = 5, since: number | null = null)`: when `since`
  is non-null, add `.gte('created_at', new Date(since).toISOString())` to the
  query (built as a `let q = …` chain). Mapping is unchanged.
- `fetchProjectedRank` and `submitScore` are unchanged.

### `src/leaderboard/useLeaderboard.ts`

- Signature becomes `useLeaderboard(pool, limit, window: TimeWindow = 'all')`.
- Inside `reload`, compute `since = windowCutoff(window)` and call
  `fetchTopScores(pool, limit, since)`. `window` joins the dependency list, so
  switching windows refetches. (Passing the enum — not a recomputed timestamp —
  keeps the deps stable and avoids a render loop.)

### `src/ui/Leaderboard.tsx`

- Add `const [win, setWin] = useState<TimeWindow>('today')`.
- Pass `win` to both `useLeaderboard('all', …, win)` and
  `useLeaderboard('popular', …, win)`.
- Render a **second tab strip** (`WINDOW_TABS`) directly under the main strip,
  shown only when the active tab is a global tab (`tab !== 'me'`). Same styling
  as the existing strip; `role="tablist"`/`role="tab"` with `aria-selected`.
- The **Me** tab shows no window strip and is unaffected.

## Testing

- **Unit:** `windowCutoff` (today = now−24h, week = now−7d, all = null, using an
  injected `now`). `fetchTopScores` adds the `created_at` filter only when
  `since` is provided (extend the existing chainable query stub with `gte`).
- **Component:** extend `Leaderboard.test.tsx` — window strip renders on a global
  tab with **Today** selected by default; selecting **All-time** calls
  `fetchTopScores(pool, limit, null)`; the window strip is **absent** on the Me
  tab. Update the two existing call-arg assertions to include the third arg
  (`expect.any(Number)` under the Today default).
- **Browser (eyeball real pixels):** on the start screen, switch Today / Weekly /
  All-time under both All Cards and Popular and confirm the list updates; confirm
  the Me tab has no window strip.

## Out of scope

- `GameOverLeaderboard` projected rank / posting (stays all-time).
- Time-windowing the local **Me** highscores.
- Any DB migration, new index, or server-side change (the existing
  `leaderboard_pool_score_idx` is adequate at this scale).
- Sub-projects A (done) and B (done).

## Risks / notes

- The cutoff is fixed when a window is selected (rolling from that moment), not
  continuously re-evaluated — fine for a leaderboard view.
- `created_at` range + `order by score` isn't perfectly index-covered, but at the
  leaderboard's scale (small table, `pool` equality + score-ordered index) this
  is negligible; revisit only if it ever proves slow.
