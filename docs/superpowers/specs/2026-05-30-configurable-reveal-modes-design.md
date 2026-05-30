# Configurable Reveal Modes — Design

Date: 2026-05-30
Status: Approved

## Summary

Add three new card-reveal animations — **zoom**, **silhouette**, **spotlight** — bringing the
total to six (blur, scanner, mosaic, zoom, silhouette, spotlight). Introduce a small Supabase
table that lets the owner enable/disable each mode without a code change. The per-round rotation
cycles only through the **enabled** modes; which mode is round 1 stays random per game. If the
toggle table can't be read or has nothing enabled, the app falls back to the three built-in modes
(blur/scanner/mosaic) so a game is never left without a reveal animation.

## Decisions

- **Code is the source of truth for which modes exist.** `RevealMode` union stays in code. The DB
  only says which existing modes are *active*; unknown keys from the DB are ignored (no "ghost"
  mode can appear that has no renderer).
- **Six modes, three new.** zoom, silhouette, spotlight added. Pixelate / TV-static were dropped
  (canvas cost, out of scope).
- **Toggle scope = all modes.** The table has one row per mode incl. blur/scanner/mosaic, so any
  mode can be turned off.
- **Read once at game start, with fallback.** Enabled modes are fetched in `selectPool` alongside
  the cards. On fetch error OR empty result → fallback `['blur','scanner','mosaic']`.
- **Cosmetic only.** Round length (15s), the 12s reveal window, scoring, and the 90s game clock are
  unchanged. New modes reach full reveal at 12s like scanner/mosaic.
- **zoom uses BOTH images.** `image_art_crop` (higher-detail artwork) for the zoomed-in phase, then
  crossfades to `image_normal` (the full card) and zooms out to the whole card.
- **When zoom is enabled, skip cards without `image_art_crop`.** Since any planned card may land on
  a zoom round, the candidate pool is filtered to cards that have an art crop whenever `'zoom'` is
  among the enabled modes. This is a no-op against today's data (every card has an art crop) but
  guards future rows; the pool stays far larger than `optionCount`, so it never starves a game.
- **Anti-leak unchanged for most modes; zoom gets a 7s text window.** Name always redacted during
  play; mana + rules text redacted for the first 5s (`scanManaRevealMs`). For **zoom**, the full
  card only materialises mid-reveal, so its rules text stays redacted for the first
  `zoomTextRevealMs` (7000ms) to stop self-referential cards (e.g. "Llanowar Wastes deals…") leaking
  the answer when the card appears.

## Architecture

Reuses the existing data flow: `App` drives `useGameClock` → `elapsedMs` → derived reveal values →
`CardStage` props. The engine stays pure and unit-tested. New: a Supabase read for the enabled set
(same pattern as the card/leaderboard reads) cached per game in the store.

### 1. Engine — `src/engine/timeAttack.ts` + `src/engine/types.ts`

- `RevealMode = 'blur' | 'scanner' | 'mosaic' | 'zoom' | 'silhouette' | 'spotlight'`.
- `REVEAL_MODES` (canonical order) stays as the full known-mode list / validation set.
- `revealModeFor(roundIndex, offset, modes: RevealMode[]) → RevealMode` — `modes[(roundIndex +
  offset) % modes.length]`. Generalises the current fixed-array version to the active list.
- `zoomFocusFor(seed, roundIndex) → { xPct, yPct }` — deterministic focus point (0–100%) for the
  zoom-in, via the same sin-hash as `scanAngleFor` (two independent hashed values).
- `spotlightOriginFor(seed, roundIndex) → { xPct, yPct }` — deterministic spotlight centre (0–100%).
- Progress reuses `scanProgressAt(elapsedMs) → 0..1` over `scanRevealMs` (12000ms) for all three
  continuous modes.
- `TimeAttackConfig` gains `zoomTextRevealMs: number`; `DEFAULT_TIME_ATTACK_CONFIG.zoomTextRevealMs
  = 7000`.

### 2. Supabase — migration `supabase/migrations/0004_reveal_modes.sql`

(0003 is taken by the parallel custom-mode work; this table is independent — no schema overlap.)

```sql
create table if not exists reveal_mode (
  key         text primary key,
  enabled     boolean not null default true,
  sort_order  int not null default 0,
  label       text
);
alter table reveal_mode enable row level security;
create policy "reveal_mode public read" on reveal_mode for select to anon using (true);
insert into reveal_mode (key, enabled, sort_order, label) values
  ('blur',       true, 0, 'Blur'),
  ('scanner',    true, 1, 'Scanner'),
  ('mosaic',     true, 2, 'Mosaic'),
  ('zoom',       true, 3, 'Zoom'),
  ('silhouette', true, 4, 'Silhouette'),
  ('spotlight',  true, 5, 'Spotlight')
on conflict (key) do nothing;
```

- RLS **on** with a single public `select` policy for `anon` (matches `card`). No client write path;
  the owner toggles rows from the Supabase dashboard (or service role).
- Seed all six keys, `enabled=true`, `sort_order` = canonical order
  (blur 0, scanner 1, mosaic 2, zoom 3, silhouette 4, spotlight 5), with human `label`s.

### 3. Client — `src/reveal/client.ts` (new)

- `fetchEnabledRevealModes(): Promise<RevealMode[]>` — `getSupabase()` → `select key from reveal_mode
  where enabled order by sort_order`. Map/filter rows to the known `RevealMode` set (ignore unknown
  keys). Returns the filtered list, or the fallback `['blur','scanner','mosaic']` on any error or an
  empty result. One focused module with one job; unit-tested with a mocked client.

### 4. Store — `src/state/gameStore.ts`

- Add `enabledModes: RevealMode[]` (default `['blur','scanner','mosaic']`).
- In `selectPool`, call `fetchEnabledRevealModes()` (in parallel with the existing card fetch); set
  `enabledModes`, and roll `revealOffset = Math.floor(Math.random() * enabledModes.length)`.
- If `enabledModes` includes `'zoom'`, filter the fetched candidates to those with an art crop
  (`image_uris.art_crop` or `card_faces[0].image_uris.art_crop`) before `planGame`. Keep the
  existing `uniqueNameCount(pool) < optionCount` guard so a (hypothetically) starved pool still
  errors cleanly rather than producing a broken game.
- `reset` restores `enabledModes` to the built-in fallback and `revealOffset` to 0. `revealSeed`
  unchanged.

### 5. Wiring — `src/App.tsx`

- `const enabledModes = useGameStore(s => s.enabledModes);`
- `const mode = revealModeFor(roundIndex, revealOffset, enabledModes);`
- `const zoomFocus = zoomFocusFor(revealSeed, roundIndex);`
- `const spotlightOrigin = spotlightOriginFor(revealSeed, roundIndex);`
- `const zoomTextHidden = playingNow && elapsedMs < config.zoomTextRevealMs;`
- Pass `mode`, `progress`(scanProgress), `zoomFocus`, `spotlightOrigin`, `zoomTextHidden` (plus the
  existing `manaHidden`/`textHidden`/tile props) to both `<CardStage>` call sites.

### 6. Component — `src/scene/CardStage.tsx`

New props: `zoomFocus?: {xPct,yPct}`, `spotlightOrigin?: {xPct,yPct}`, `zoomTextHidden?: boolean`.
New branches (existing blur/scanner/mosaic unchanged):

- **silhouette**: the full card image with a CSS `filter` driven by `progress` — starts a dark,
  desaturated silhouette (`brightness(0.05) saturate(0)`-ish) and animates to full
  brightness/colour by `progress=1`, plus a dark overlay that fades out. Standard anti-leak
  (name always; mana+text first 5s, `zIndex:2`).
- **spotlight**: a dark cover (`#07050a`) over the card with a `radial-gradient` "hole" centred at
  `spotlightOrigin`, whose transparent radius grows with `progress` (0 → covering the card). Cover
  dropped at `progress≥1` / `over`. Standard anti-leak overlays above the cover.
- **zoom** (dual-image): two stacked `<img>` (artUrl = `image_art_crop` with fallback to normal;
  cardUrl = `image_normal`).
  - Phase A (progress 0 → `ZOOM_CROSSFADE` ≈ 0.5): art image scaled `ZOOM_START_SCALE` (≈2.5) → 1,
    `transform-origin` at `zoomFocus`.
  - Phase B (`ZOOM_CROSSFADE` → 1): crossfade art→normal (opacity), normal scaled from "art fills
    the frame" (≈`ZOOM_CARD_START`) → 1, so the frame + text grow in around the art.
  - On `over`: only the full normal card, scale 1.
  - Anti-leak for zoom: name redacted whenever the full card is visible during play; **rules text
    redacted while `!over && zoomTextHidden` (first 7s)**; mana revealed with the card. The
    `ZOOM_CROSSFADE`/scale constants live in `CardStage` (layout) and are tunable during visual
    verification; `zoomTextRevealMs` (timing) lives in config.

### 7. Data Flow

```
selectPool → fetchEnabledRevealModes() (fallback on error/empty) → store.enabledModes
roundIndex + revealOffset + enabledModes → revealModeFor → mode
useGameClock → elapsedMs → scanProgressAt → progress
revealSeed + roundIndex → zoomFocusFor / spotlightOriginFor → params
elapsedMs < zoomTextRevealMs → zoomTextHidden ; elapsedMs < scanManaRevealMs → mana/text hidden
{ mode, progress, zoomFocus, spotlightOrigin, manaHidden, textHidden, zoomTextHidden, … } → CardStage
```

## Error / Edge Handling

- **Toggle fetch fails / table missing / empty** → `['blur','scanner','mosaic']` fallback; game
  always playable.
- **Unknown DB key** (e.g. a typo or a future key) → filtered out, never selected.
- **Only one mode enabled** → every round uses it (`% 1` = always index 0); rotation degenerates
  gracefully.
- **Missing `art_crop`** (zoom) → primarily handled upstream: when zoom is enabled, such cards are
  filtered out of the pool in `selectPool`, so they never reach a zoom round. As a last-resort
  render guard the zoom branch still falls back to `image_normal` for the art layer. Existing
  `if (!cardUrl)` guard preserved.
- **Fast guess / time-out / `over`** → all overlays, covers, and zoom layers drop to the full card
  incl. name, like the other modes.
- **Determinism** — `zoomFocusFor` / `spotlightOriginFor` are pure functions of `(seed, roundIndex)`,
  stable across re-renders so the focus/spotlight never jumps mid-round.

## Testing

- **Engine units:** `revealModeFor` with lists of length 1 / 2 / n (rotation + wrap + offset);
  `zoomFocusFor` & `spotlightOriginFor` (deterministic for fixed input, values in [0,100], vary
  across rounds).
- **Client units:** `fetchEnabledRevealModes` returns filtered known keys ordered by `sort_order`;
  returns fallback on thrown error and on empty result; ignores unknown keys (mocked Supabase).
- **Store:** `selectPool` sets `enabledModes` and an in-range `revealOffset`; `reset` restores the
  fallback.
- **Component:** each new mode renders its signature element (silhouette overlay/filter, spotlight
  `radial-gradient` cover, zoom two `<img>` layers) and the correct anti-leak overlays; name present
  while playing and gone on `over`; zoom rules-text present while `zoomTextHidden`, gone after; all
  overlays/covers drop when `over`.
- **Browser verification:** after `npm run build`, eyeball each new mode in a real browser tab
  (preview rAF throttling prevents screenshotting animations — known gotcha); confirm a disabled
  mode never appears and the fallback works when the table is unreachable.

## Out of Scope

- No per-mode difficulty tuning, weighting, or ordering beyond `sort_order`; no in-app settings UI
  (toggles are edited in Supabase).
- No new leaderboard / pool / scoring changes.
- No changes to the parallel custom-mode work (independent table & feature).
- Pixelate and TV-static modes (deferred).
