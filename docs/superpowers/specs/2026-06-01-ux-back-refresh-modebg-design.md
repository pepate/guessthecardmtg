# UX: device-back nav, pull-to-refresh, mode-detail background

**Date:** 2026-06-01 · **Status:** Approved (brainstorming)

Three independent UX features.

## A. Device/browser Back navigation
Hardware (Android) / browser back / swipe-back navigates to the previous screen.
- New hook `useScreenBack(canGoBack, onBack)` in `src/ui/useScreenBack.ts`: when `canGoBack` becomes true it pushes one history entry (`history.pushState`); a single `popstate` listener calls `onBack`. Re-pushes defensively so repeated back works without double-popping.
- Wiring in `App`: `canGoBack = phase !== 'idle-list-root'` i.e. any of: idle non-list view (picker/create/profile), `gameover`, `playing`, `loading`. `onBack` maps by current state: picker/create/profile → `setView({s:'list'})`; gameover → `reset()`; playing/loading → `reset()` (same as the on-screen home button). Root list pushes nothing → normal browser/app exit.
- Constraint: never traps the user; exactly one app history entry exists while on a non-root screen.

## B. Pull-to-refresh (all non-game screens)
Touch pull-down at scrollTop 0 past a threshold refreshes the screen's data.
- New component `src/ui/PullToRefresh.tsx`: wraps a scroll container, owns the scrollable div, handles `touchstart/move/end`; when pulled past ~64px at top, calls `onRefresh()` (async) and shows a spinner until it resolves. Touch-only; no behavior change for mouse/desktop.
- Each screen exposes a refetch callback and wraps its scroll area:
  - `StartModes` — refetch modes + standings (extract the load effect into `load()`).
  - `ModeDetail` — refetch leaders + runs (extract into `load()`); used in both picker and game-over.
  - `ProfilePanel` — refetch profile + bests.
- Indicator: a small centered spinner row that appears at the top while refreshing.

## C. Mode-detail background = top-EDHRec card art
On the mode-detail (picker) screen only, the full-bleed background is the artwork of the pool's card with the smallest `edhrec_rank`.
- New RPC `mode_top_card_art(p_filter jsonb) returns text` — the `image_art_crop` of the matching card with the lowest non-null `edhrec_rank` (`order by edhrec_rank asc nulls last limit 1`), reusing the same filter predicate as `get_filtered_game_cards`. `grant execute to anon, authenticated`. Applied + (no edge fn) via management API.
- Client `src/daily/.. no` → `src/cards/client.ts`: `fetchModeTopArt(filter): Promise<string|null>`.
- `StartArtwork` gains an optional `artUrl?: string | null` prop: when provided, uses it instead of fetching a random card. `App` computes the mode's top art when `view.s==='picker'` (via a small effect/hook) and passes it; otherwise random as today. Game-over keeps `GameOverArtwork` (random).

## Testing
- `useScreenBack`: pushes on activate; `popstate` calls `onBack`; inactive pushes nothing.
- `PullToRefresh`: simulated touch pull > threshold at top → `onRefresh` called; small pull or not-at-top → not called.
- `fetchModeTopArt` maps RPC result → url|null; `StartArtwork` renders the `artUrl` override.
- Browser smoke: back navigates screens; pull refreshes a board; picker shows the top-EDHRec art.

## Files
- New: `src/ui/useScreenBack.ts`, `src/ui/PullToRefresh.tsx`, migration `0016_mode_top_card_art.sql`.
- Modified: `src/App.tsx`, `src/ui/StartModes.tsx`, `src/ui/ModeDetail.tsx`, `src/ui/ProfilePanel.tsx`, `src/cards/client.ts`, `StartArtwork` (in App.tsx).
