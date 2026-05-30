# Leaderboard & Layout Refinements — Design

**Date:** 2026-05-30
**Status:** Approved (design)
**Sub-project:** D (follow-up refinements to B + C)

## Problem

Five tester refinements after A/B/C shipped:

1. **Landscape spacing:** in the side-by-side layout the options sit far from the
   card (big gap). Put them directly next to the card so the eye travels less.
2. **Game-over board:** show the played pool's online top-5 plus the player's
   projected position, while keeping the "post your score" flow.
3. **Pull-to-refresh:** pulling down on the start screen should refresh the
   leaderboard.
4. **Loading spinner:** show a small spinner where the "no data" text currently
   sits while the leaderboard loads.
5. **Dynamic ranking:** the start-screen play buttons must stay visible even when
   the ranking list (with "Show more") is long.

All client-side; no DB changes.

## Decisions (confirmed with user)

- **Landscape:** center the `[card][options]` pair as a group with a small
  (~16px) gap, options hugging the card's right edge.
- **Game-over:** show the top-5 + pinned projected position immediately, AND keep
  the name + "Post to online board" controls.

## Design

### 1. Landscape pair (`App.tsx`, `CardStage.tsx`, `index.css`)

- In the **playing** phase when `wide`, render a centered flex row
  `.play-wide`: `[CardStage(inline)] [options column]`, `gap: 16px`,
  `justify-content: center`, `align-items: center`, `flex: 1`.
- The full-screen background `CardStage` renders only when **not** (playing &&
  wide) — i.e. portrait always, and game-over (card behind the overlay).
- `CardStage` `wide` now means **inline**: wrapper sizes to content
  (`display:flex; align-items:center; height:100%`, no full-width); card style
  `height: min(78vh, 88vw)`, `width:auto` (aspect-ratio box), `maxWidth:none`.
- The options column: `display:flex; flex-direction:column; justify-content:center;
  gap:14px; width:min(40vw,380px); pointer-events:all;` holding `Timer` +
  `NameChoice layout="column"`.
- Remove the `.side-panel` rule (replaced by `.play-wide` + `.options-col`).
- Pointer events: row `none`, options column `all`, card non-interactive.

### 2. Game-over board (`GameOverLeaderboard.tsx`)

- On mount (enabled && score > 0): fetch **both** `fetchProjectedRank(pool, score)`
  and `fetchTopScores(pool, 5)`; store `top`.
- Render the board **above** the input always: `GlobalScoreList` with
  `entries={top}`, `highlightId={posted?.id}`, and `pinned` = projected "You" row
  (`{ rank: projected.rank, entry: {id:'projected', name: name||'You', score,
  correct, pool, country:null, createdAt: now} }`) shown only when
  `projected.rank > top.length` (i.e. outside the visible five).
- Keep the existing "You'd be ranked #X of N" caption, the name input, and the
  Post button. After a successful post: refetch `top`, set `posted`, highlight the
  real row (`highlightId`), and pin only if still outside the five.

### 3. Pull-to-refresh (`usesPullToRefresh.ts`, `App.tsx`, `Leaderboard.tsx`, `useLeaderboard.ts`)

- New `src/ui/usePullToRefresh.ts`: returns `{ ref, pull }`. On `touchstart` while
  the element is scrolled to top, track `touchmove` delta; expose damped `pull`
  px (cap ~80, `preventDefault` while pulling); on `touchend`, if `pull >=
  THRESHOLD` (64), call `onRefresh()`; always reset.
- `App` idle: attach `ref` to the leaderboard scroll region; render a `.spinner`
  pull indicator whose height follows `pull`; `onRefresh = () =>
  setLbRefreshKey((k) => k + 1)`.
- Thread a `refreshKey` down: `StartLeaderboard` → `Leaderboard refreshKey` →
  `useLeaderboard(pool, limit, window, refreshKey)` with `refreshKey` in the
  reload deps so a bump refetches.

### 4. Loading spinner (`index.css`, `Leaderboard.tsx`, `App.tsx`)

- Move `@keyframes spin` to `index.css` and add a reusable `.spinner` class
  (22px ember ring). Update `App`'s `LoadingScreen` to use `.spinner`.
- In `Leaderboard`'s `GlobalView`: when `state.loading && state.entries.length
  === 0`, render a centered `.spinner` (`data-testid="leaderboard-spinner"`)
  instead of the empty list.

### 5. Dynamic ranking / pinned buttons (`App.tsx`)

- Restructure the idle bottom-sheet into a flex column (`maxHeight: 92%`):
  - a **scroll region** (`flex:1 1 auto; min-height:0; overflow-y:auto`) holding
    the pull indicator + `StartLeaderboard` (the list + "Show more" scroll here);
  - `PoolSelect` in a `flex-shrink:0` footer that stays visible.

## Out of scope

- DB / RPC changes; `GameOverLeaderboard` posting rules beyond showing the board;
  windowing the local "Me" list; portrait gameplay layout (unchanged).

## Testing

- **Unit:** `.spinner` shows while loading-empty and the empty message shows when
  not loading (Leaderboard); `useLeaderboard` refetches when `refreshKey` changes;
  `GameOverLeaderboard` renders the top-5 board + pinned projected row on mount.
- **Browser (eyeball):** landscape pair is adjacent & centered (portrait & desktop
  unaffected); start-screen play buttons stay visible while the ranking scrolls /
  expands; pull-to-refresh re-queries (network shows a fresh `leaderboard_top`
  request); spinner appears before rows load; game-over shows top-5 + your spot.

## Risks / notes

- Touch events are awkward in jsdom; the pull gesture is verified primarily in the
  browser. The hook keeps logic in refs to avoid stale closures.
- `preventDefault` on pull only fires while actively pulling at scrollTop 0, so it
  won't block normal scrolling.
