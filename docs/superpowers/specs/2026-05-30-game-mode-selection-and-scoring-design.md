# Game-Mode Selection & Per-Mode Scoring — Design

Date: 2026-05-30
Status: Approved

## Summary

Three linked changes to how a game is configured and scored:

1. **Timer:** the whole game shrinks from 90s to **30s**.
2. **Pre-game mode selection:** the reveal animation no longer rotates per round. Before a
   game the player picks **Random** or **one specific reveal mode** (blur/scanner/mosaic/
   zoom/silhouette/spotlight); the entire game runs in that single mode.
3. **Per-mode leaderboard:** every submitted score is tagged with the reveal mode it was
   played in (`game_mode`), scores are ranked per mode, and clicking a leaderboard entry
   starts a new game in that entry's reveal mode.

"Game mode" throughout = the **reveal animation**. Random resolves to ONE concrete mode at
game start (no mid-game switching) and is scored under that actual mode — there is no separate
"random" board, and `game_mode` is always a concrete mode.

This feature is built in an **isolated worktree**. Parts 2 & 3 touch the leaderboard schema,
`submit-score`, the leaderboard client and UI — files the parallel custom-mode session is also
editing — so merge conflicts are expected and the user resolves them when both branches land.

## Decisions

- **Single mode per game.** Per-round rotation (`revealModeFor`/`revealOffset`) is removed.
  The store holds one `gameMode: RevealMode` for the game; `App` uses it directly.
- **Random = one concrete mode.** On game start, `'random'` resolves to a uniformly random
  pick from the enabled modes; the game runs entirely in it and is scored under that mode.
- **Reveal mode is orthogonal to pool (Approach A).** The existing pool axis
  (`popular`/`all`/`custom`+`mode_id`) is unchanged; `game_mode` is an additional column/
  filter. A score belongs to `(pool/mode_id, game_mode)`.
- **Click-to-play adopts the reveal mode only.** Clicking a leaderboard entry starts a new
  game in that entry's `game_mode`, using the **currently viewed pool** (the leaderboard's
  active pool tab; default `popular`). It does NOT adopt the entry's pool/custom-mode.
  (Consequence: clicking a custom-mode entry replays the reveal animation on the default
  pool, not the custom mode. Confirmed simplification.)
- **Toggles still gate the choices.** The pre-game picker only offers modes that are enabled
  in the Supabase `reveal_mode` table (via `fetchEnabledRevealModes`), plus Random.

## Architecture

### 1. Config — `src/engine/types.ts`
- `DEFAULT_TIME_ATTACK_CONFIG.gameDurationMs: 90000 → 30000`. Nothing else changes
  (`durationMs` per-card 15s and scoring untouched).

### 2. Engine — `src/engine/timeAttack.ts`
- Remove `revealModeFor` (rotation no longer used) and its tests. Keep `KNOWN_REVEAL_MODES`,
  `RevealMode`, and the per-mode reveal helpers (`scanProgressAt`, `tilesRevealedAt`,
  `tileOrderFor`, `spotlightOriginFor`).
- Add `resolveGameMode(choice: RevealMode | 'random', enabled: RevealMode[]): RevealMode` —
  returns `choice` if concrete, else a random element of `enabled` (falls back to `'blur'`
  if `enabled` is empty). Pure + unit-tested.

### 3. Store — `src/state/gameStore.ts`
- State: remove `revealOffset`; add `gameMode: RevealMode` (default `'blur'`) and
  `pendingRevealChoice: RevealMode | 'random'` (default `'random'`). Keep `enabledModes`.
- Action `setRevealChoice(choice)` — sets `pendingRevealChoice` (used by the picker + click-to-play).
- Action `loadRevealModes()` — calls `fetchEnabledRevealModes()` and stores `enabledModes`;
  invoked once when the app is idle so the picker has the list before `selectPool`.
- `selectPool(selection)` (signature unchanged — avoids threading through the custom-mode
  flow): reads `pendingRevealChoice` + `enabledModes`, sets
  `gameMode = resolveGameMode(pendingRevealChoice, enabledModes)`. Keeps the existing
  art-crop pool filter when the resolved `gameMode === 'zoom'` (was: when zoom was enabled).
  No `revealOffset`.
- `reset`: `pendingRevealChoice → 'random'`, `gameMode → 'blur'`.

### 4. App wiring — `src/App.tsx`
- Replace `mode = revealModeFor(roundIndex, revealOffset, enabledModes)` with
  `mode = useGameStore(s => s.gameMode)`. Remove `revealOffset`/`revealModeFor` usage.
- On mount (idle), call `loadRevealModes()` (effect) so the picker is populated.

### 5. Pre-game picker UI — `src/ui/RevealModePicker.tsx` (new) + `PoolSelect.tsx`
- `RevealModePicker`: a compact pill/segmented row rendering **Random** + each enabled mode
  (labels from the `reveal_mode` rows / a static label map), bound to `pendingRevealChoice`
  via `setRevealChoice`. Default highlighted = Random.
- Rendered on the start screen above the existing Popular/All/Custom buttons in `PoolSelect`.
  The pool buttons keep calling `selectPool(selection)`; the chosen reveal mode rides along in
  the store. (CustomModeBrowser's call path is untouched.)

### 6. Leaderboard schema — migration `supabase/migrations/0005_game_mode.sql`
- `alter table leaderboard add column game_mode text;`
- Index for per-mode ranking: `create index ... on leaderboard (game_mode, score desc, created_at);`
- The public view `leaderboard_top` must expose `game_mode` — recreate it adding the column.
- Existing rows keep `game_mode = null` (excluded from mode-filtered boards; acceptable).
- Independent of the custom-mode tables; sequential number `0005` (0004 = reveal_mode toggles).

### 7. Score submission — `supabase/functions/submit-score/index.ts`
- Accept `game_mode` in the payload; validate it is one of the six known reveal modes
  (hardcode the list in the function) — reject with 400 otherwise.
- Include `game_mode` in the insert and in the rank-count query (count rows with higher score
  filtered by the same `game_mode`, in addition to the existing pool/mode_id filter).

### 8. Leaderboard client/types — `src/leaderboard/client.ts`, `types.ts`
- `SubmitPayload` gains `gameMode: RevealMode`; `submitScore` sends it as `game_mode`.
- `GlobalEntry` gains `gameMode: RevealMode | null`.
- `fetchTopScores`, `fetchProjectedRank`, `fetchModeTopScores`, `fetchModeProjectedRank` gain
  an optional `gameMode?: RevealMode` filter (adds `.eq('game_mode', gameMode)` when set).

### 9. Score UI — `src/ui/GameOverLeaderboard.tsx`, `GlobalScoreList.tsx`, `Leaderboard.tsx`
- **Game over:** the board is fetched filtered to the just-played `gameMode` (within the
  game's pool); the projected rank uses the same filter; `submitScore` sends `gameMode`.
- **Rows:** `GlobalScoreList` rows render a small `game_mode` badge and become clickable;
  clicking calls `setRevealChoice(entry.gameMode)` then starts a game with the currently
  viewed pool (default `popular`, excludeUB true) via `selectPool`.
- **Start leaderboard:** keep the existing pool tabs + time windows; add the badge + click
  behaviour only. No dedicated reveal-mode filter tab (kept out to limit the collision surface).

## Data Flow

```
mount(idle) → loadRevealModes() → store.enabledModes
picker → setRevealChoice(choice) → store.pendingRevealChoice
PoolSelect button → selectPool(selection)
  → gameMode = resolveGameMode(pendingRevealChoice, enabledModes)  (store)
App → mode = store.gameMode → CardStage (single mode, no rotation)
game over → submitScore({pool, modeId, gameMode, ...}) → leaderboard.game_mode
board reads → fetchTopScores(pool, …, gameMode) → ranked per mode
click entry → setRevealChoice(entry.gameMode) → selectPool(currentPool)
```

## Error / Edge Handling

- **Empty enabled set** → `resolveGameMode` falls back to `'blur'`; picker still shows Random
  (resolving to blur). `selectPool`'s existing pool guards are unchanged.
- **Old leaderboard rows (`game_mode` null)** → absent from mode-filtered boards; not an error.
- **Unknown `game_mode` at submit** → edge function returns 400; client surfaces the error like
  any failed submit.
- **Clicking a custom-mode entry** → plays the entry's reveal mode on the default pool (by
  decision); no attempt to resurrect the custom mode_id.
- **Zoom + Random** → if Random resolves to zoom, the art-crop pool filter applies in
  `selectPool` (cards without art_crop excluded), same as before.

## Testing

- **Engine:** `resolveGameMode` (concrete passthrough; random ∈ enabled; empty → 'blur';
  deterministic given a stubbed RNG seam). `gameDurationMs` is 30000.
- **Store:** `selectPool` sets `gameMode` from `pendingRevealChoice` (concrete + random);
  `setRevealChoice` updates state; `reset` restores defaults; zoom-random keeps the art-crop filter.
- **Client:** fetch/rank/submit thread `game_mode` (filter applied; payload renames to `game_mode`).
- **submit-score:** unit/contract — rejects unknown `game_mode`; accepts a known one.
- **UI:** picker selects a mode and it reaches `selectPool`; a leaderboard row renders a
  game_mode badge and clicking it sets the reveal choice + starts a game (mocked `selectPool`).
- **Browser verification:** real-browser eyeball — pick each mode + Random and confirm the
  whole game stays in one mode; game-over board shows the per-mode ranking; clicking an entry
  starts that mode; 30s timer.

## Out of Scope

- No dedicated reveal-mode filter tab on the start leaderboard (badges + click only).
- Click-to-play does not adopt the entry's pool / custom mode (reveal mode only).
- No change to the per-card scoring curve, the pool/custom-mode system, or the `reveal_mode`
  toggle table.
- No "random" leaderboard bucket (random games score under their resolved mode).
