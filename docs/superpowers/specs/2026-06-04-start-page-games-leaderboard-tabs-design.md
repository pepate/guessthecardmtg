# Start page: Games / Leaderboard tabs

Date: 2026-06-04

## Goal

Make the start page feel friendlier and less technical by splitting it into two
tabs under an always-visible Daily Set:

- **Games** (default): the 4 games the player most recently played, shown as
  friendly artwork cards. Tapping a card opens the existing mode-detail screen.
- **Leaderboard**: the current start screen — time-window pills + the ranked
  mode list — unchanged, just moved into a tab.

## Layout

```
[ Daily Set ]              ← always visible, above the tabs
[ Games | Leaderboard ]    ← tab switch, default: Games
  Games:        up to 4 recently-played game cards
  Leaderboard:  time-window pills + mode list (as today)
```

Daily Set and the tab header stay fixed; only the content below the tabs
switches. Tab state is local to the start screen: `'games' | 'leaderboard'`,
defaulting to `games`.

## Components

### StartModes (container) — `src/ui/StartModes.tsx`
- Renders `<DailySet />` (always), then the tab switch, then the active tab's
  content.
- Holds the `tab` state (default `games`).
- The **Leaderboard** tab keeps today's content verbatim: the time-window pills
  (Today / Weekly / All-time / Recent) and the ranked mode list. This is
  extracted as-is into the tab branch (no behavioural change).

### RecentGames (new) — `src/ui/RecentGames.tsx`
- Resolves the device's recently-played games and renders up to 4 cards.
- **Card**: the pool's top-card artwork (`fetchModeTopArt(filter)`) as the
  background, the game name, and one small stat (the board's top score / leader).
  Tapping a card calls `onPick(mode)` — the same callback the leaderboard list
  uses — so it opens the existing `ModeDetail` (ranking + reveal-mode picker +
  preview + Play). No new detail screen.
- Artwork is best-effort: if the fetch fails, the card shows a plain background.

## Data flow

### Recently-played games (from server runs)
- Source: the public-read `leaderboard_top` view (already used by
  `fetchModeRuns`). Query the current device's rows ordered by recency:
  `select mode_id, created_at from leaderboard_top where device_id = <uid>
  order by created_at desc` (capped, e.g. limit 50).
- Dedupe `mode_id` keeping first occurrence → the 4 most recent distinct modes.
- Resolve each `mode_id` to its display data (name, filter, card_count) via the
  existing mode client (`listModes` / `getModeById`).
- New client helper, e.g. `fetchRecentGames(uid, limit = 4)` in
  `src/leaderboard/client.ts` (or a small `src/modes/recent.ts`), returning
  `CustomModeListItem`-shaped entries the card and `onPick` already understand.
- No new RPC or migration: `leaderboard_top` is already public-read and exposes
  `device_id` + `created_at`.

### Fill / empty state
- If the device has fewer than 4 recent games (new player, no session, or no
  submitted runs), fill the remainder with popular/standard games so the tab
  always shows 4 cards: the built-in modes (`Popular`, `All cards`) plus the
  top entries from `listModes`, de-duplicated against the recent ones.

### Click-through
- A game card and a leaderboard list row both call `onPick(mode)` →
  `App` sets `view = { s: 'picker', mode }` → `RevealPicker` → `ModeDetail`.
  Unchanged plumbing.

## Known approximation

"Recently played" is derived from server runs, which store only the **best** run
per (mode, reveal); `created_at` is when that best was set. For most players this
matches recent play. Exact play history would require local per-device tracking
(explicitly decided against in favour of the server source).

## Error handling
- No session / no `uid` → skip the recent query, show the popular fallback.
- Query failure → fall back to popular; never block the tab.
- Artwork fetch failure → plain card background.

## Testing
- Recent-games resolver: dedupes `mode_id`, caps at 4, fills the remainder with
  popular games, handles "no uid" and query errors (fallback).
- `RecentGames` component: renders up to 4 cards; tapping a card fires
  `onPick` with the right mode.
- Tab switch: defaults to Games; switching to Leaderboard shows the
  pills + mode list; Daily Set stays visible across both.

## Out of scope
- Local play-history tracking.
- Any change to `ModeDetail`, the Daily Set flow, or scoring.
