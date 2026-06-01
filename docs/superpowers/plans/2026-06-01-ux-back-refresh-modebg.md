# UX (back nav / pull-to-refresh / mode background) — Plan

> Execute task-by-task; TDD where unit-testable. Spec: `docs/superpowers/specs/2026-06-01-ux-back-refresh-modebg-design.md`.

**Tech:** React+TS+Vite, Vitest. Supabase token (this session) supplied at deploy time; apply migration via management API `POST /v1/projects/jgapiqpaeaslfpbgiptf/database/query`.

## Task 1: `useScreenBack` hook
- Create `src/ui/useScreenBack.ts` + test.
- `useScreenBack(active: boolean, onBack: () => void)`: on `active` true, `history.pushState({ __screen: true }, '')` once; add a `popstate` listener that, while active, calls `onBack()`. On deactivate/unmount, remove listener. Use a ref for the latest `onBack`.
- Test (jsdom): render a harness with active=true; `window.dispatchEvent(new PopStateEvent('popstate'))` → onBack called. active=false → pushState not called.

## Task 2: `PullToRefresh` component
- Create `src/ui/PullToRefresh.tsx` + test.
- Props `{ onRefresh: () => Promise<unknown> | void; children }`. Renders a scroll div (`style overflowY:auto, height:100%`). Touch handlers: record startY on touchstart only when `scrollTop<=0`; on touchmove compute pull = currentY-startY; if pull>0 show indicator height; on touchend if pull>THRESHOLD(64) call onRefresh and show spinner until resolved. data-testid="ptr-root", indicator "ptr-spinner".
- Test: mock onRefresh; fire touchstart(y=0)/touchmove(y=120)/touchend with scrollTop 0 → onRefresh called; small move (y=20) → not called.

## Task 3: `mode_top_card_art` RPC (migration + apply)
- Create `supabase/migrations/0016_mode_top_card_art.sql`: function mirroring `get_filtered_game_cards` filter, `order by c.edhrec_rank asc nulls last limit 1`, returns the chosen card_art `image_art_crop` (text). grant anon, authenticated.
- Apply via management API. Verify returns a url for `{"edhrec":{"max":100}}`.

## Task 4: `fetchModeTopArt` client
- Add to `src/cards/client.ts`: `fetchModeTopArt(filter): Promise<string|null>` calling `rpc('mode_top_card_art', { p_filter: canonicalizeFilter(filter) })`.
- Test: mock supabase rpc → returns url; null on error.

## Task 5: Wire into screens
- `StartArtwork` (App.tsx): add `artUrl?: string|null` prop; if provided use it (skip random fetch). App: when `view.s==='picker'`, fetch `fetchModeTopArt(view.mode.filter)` in an effect and pass as `artUrl`.
- `useScreenBack` in App: active when not on root list; onBack maps per state.
- Wrap StartModes / ModeDetail / ProfilePanel scroll areas in `PullToRefresh` with their refetch fns (extract each load effect into a callable `load()`).

## Task 6: Verify
- `npx tsc -b`, `npm run build`, `npx vitest run` all green.
- Deploy migration; browser smoke (back, pull-refresh, picker bg).
