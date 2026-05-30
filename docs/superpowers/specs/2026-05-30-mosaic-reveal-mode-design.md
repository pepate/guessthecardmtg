# Mosaic Reveal Mode — Design

Date: 2026-05-30
Status: Approved

## Summary

Add a third card-reveal animation ("mosaic") alongside the existing stage-based
**blur** and the **scanner** sweep. The card is split into a 4×6 grid of 24 equal
rectangular tiles, all dark at start. Every 0.5 seconds one randomly-chosen tile is
uncovered, so the full card is revealed after 12 seconds. As with the other two
modes the **name** stays hidden during play, and the **mana cost** stays hidden for
the first 5 seconds (in case its tile is uncovered early). On round end the full
card — including the name — is shown, exactly like blur and scanner.

The three modes rotate strictly per round (`blur → scanner → mosaic → …`); which
mode is round 1 is chosen randomly per game.

## Decisions

- **Cosmetic only.** Round length stays 15s and scoring is unchanged (linear
  1000→100 decay). The mosaic reaches full reveal at 12s (24 tiles × 0.5s),
  matching the scanner's 12s sweep and leaving ~3s of full visibility before
  time-out. No changes to round flow, scoring, or the 90s game clock.
- **Rotation (3 modes).** Strict A/B/C/A/B/C by round index. The previous
  two-mode `revealParity: 0|1` becomes `revealOffset: 0|1|2`, chosen randomly per
  game, selecting which mode is round 1.
- **Grid.** 4 columns × 6 rows = 24 equal tiles. Tiles are positioned/sized in
  percentages against the card's `488/680` aspect ratio (each ~25% × ~16.67%).
- **Reveal cadence.** One tile every `mosaicTileMs` (500ms). `tilesRevealedAt`
  counts `floor(elapsedMs / 500)`, capped at 24: 0 at t≤0, 1 at 0.5s, 24 at 12s.
- **Reveal order.** Deterministic pseudo-random permutation of the 24 tile indices
  from `(seed, roundIndex)` — stable across re-renders (no flicker), different per
  card. A tile is covered while its rank in this order `>= tilesRevealed`.
- **Name.** Hidden during play (frosted redaction over the title) regardless of
  which tiles are open; revealed when the round resolves, same payoff as the other
  modes.
- **Mana cost.** Hidden for the first `scanManaRevealMs` (5000ms), reusing the same
  rule and `manaHidden` derivation as the scanner, then auto-revealed. Prevents an
  early top-right tile from leaking the mana cost.
- **Tile look.** Covered tiles are solid dark (`#08060c`, the existing `Mask`
  style). On reveal a short amber flash then fade-out, matching the scanner's amber
  energy aesthetic, driven by a Framer Motion `exit` keyframe.

## Architecture

Reuses the existing data flow: `App` drives a per-round `requestAnimationFrame`
clock (`useGameClock`) → `elapsedMs` → derived reveal values → `CardStage` props.
The store already exposes `roundIndex` and `revealSeed`. The engine stays pure and
unit-tested.

### 1. Engine — `src/engine/timeAttack.ts` + `src/engine/types.ts`

- `RevealMode` gains `'mosaic'`: `'blur' | 'scanner' | 'mosaic'`.
- `TimeAttackConfig` gains `mosaicCols: number`, `mosaicRows: number`,
  `mosaicTileMs: number`; `DEFAULT_TIME_ATTACK_CONFIG` = `4`, `6`, `500`.
- `revealModeFor(roundIndex, offset: 0|1|2) → RevealMode` — `MODES[(roundIndex +
  offset) % 3]` with `MODES = ['blur', 'scanner', 'mosaic']`.
- `tilesRevealedAt(elapsedMs, config?) → number` — `min(tileCount,
  floor(elapsedMs / mosaicTileMs))`, where `tileCount = mosaicCols * mosaicRows`;
  0 at `elapsedMs <= 0`.
- `tileOrderFor(seed, roundIndex, tileCount) → number[]` — a permutation of
  `[0..tileCount-1]` derived via the same sin-hash technique as `scanAngleFor`
  (per-tile sort keys, then sorted). Deterministic for a fixed `(seed, roundIndex)`,
  varies across rounds.

### 2. Store — `src/state/gameStore.ts`

- Rename state `revealParity: 0 | 1` → `revealOffset: 0 | 1 | 2`.
- Set it to `Math.floor(Math.random() * 3)` in `selectPool` (re-rolled on
  `restart`, which re-calls `selectPool`). `revealSeed` is unchanged and reused.
- Reset to `0` in `reset`. `roundIndex` already drives the rotation.

### 3. Wiring — `src/App.tsx`

- `mode = revealModeFor(roundIndex, revealOffset)`.
- When `mode === 'mosaic'`:
  `tileOrder = tileOrderFor(revealSeed, roundIndex, tileCount)` and
  `tilesRevealed = playingNow ? tilesRevealedAt(elapsedMs) : tileCount`, with
  `tileCount = config.mosaicCols * config.mosaicRows`.
- The existing mana derivation (`elapsedMs < config.scanManaRevealMs`, passed as
  `manaHidden`) now applies to scanner **and** mosaic.
- Pass `mode`, `tileOrder`, `tilesRevealed`, `manaHidden` to both `<CardStage>`
  call sites (portrait and wide). Blur and scanner props are unchanged.

### 4. Component — `src/scene/CardStage.tsx`

New props: `mode: 'blur' | 'scanner' | 'mosaic'`, `tileOrder?: number[]`,
`tilesRevealed?: number`. Defaults keep existing callers/tests unaffected.

- **Blur / scanner modes:** unchanged.
- **Mosaic mode:** render the full card `<img>` (same `card-image` testid/attrs),
  then inside `AnimatePresence`:
  - **Tile covers** — for each tile index `t` in `[0..tileCount-1]`, compute its
    row/col → `top/left/width/height` in %. The reveal step is `tileOrder`'s rank
    of `t`; render a dark cover (`#08060c`) while `!over && step >= tilesRevealed`,
    keyed `tile-${t}`. On exit (uncover): amber flash + fade via keyframe
    `backgroundColor: ['#08060c', '#ffd79a', 'transparent']`, `opacity: [1,1,0]`.
    A `data-testid="mosaic-tile"` (with `data-tile`) aids testing.
  - **Name redaction** — reuse the frosted `Blur` over the title at `zIndex:2`
    (above the tiles), shown while `!over`, removed on round end.
  - **Mana redaction** — reuse the frosted `Blur` over the mana area at `zIndex:2`,
    shown while `!over && manaHidden`.
  - No type/text/power blurs and no art-mask in mosaic mode.
- The rarity glow `box-shadow` applies in all modes.

## Data Flow

```
useGameClock → elapsedMs
roundIndex + revealOffset → revealModeFor → mode
elapsedMs (+ over) → tilesRevealedAt → tilesRevealed
revealSeed + roundIndex → tileOrderFor → tileOrder
elapsedMs < scanManaRevealMs (+ playing) → manaHidden
{ mode, stage, tileOrder, tilesRevealed, manaHidden, wide } → CardStage
```

## Error / Edge Handling

- **Very fast guess / time-out.** On `over`, all tiles and the name/mana redactions
  drop (AnimatePresence) → full card incl. name shown, same as blur/scanner.
- **t=0.** `tilesRevealed = 0` → all 24 tiles covered (card fully dark), consistent
  with the scanner's dark start.
- **Missing image.** Existing `if (!cardUrl)` guard preserved for all modes.
- **Order stability.** `tileOrderFor` is deterministic per `(seed, roundIndex)`, so
  re-renders during a round never reshuffle which tile opens next.

## Testing

- **Engine units:**
  - `revealModeFor` — rotates `blur/scanner/mosaic` across round indices for all
    offsets 0/1/2, wraps correctly mod 3.
  - `tilesRevealedAt` — 0 at t≤0, 1 at 500ms, 24 at 12000ms, capped at 24 beyond.
  - `tileOrderFor` — valid permutation (length `tileCount`, each index 0..23 exactly
    once); deterministic for a fixed `(seed, roundIndex)`; differs across rounds.
- **Component:** a mosaic round renders `card-image` with `mosaic-tile` covers equal
  to `tileCount - tilesRevealed`, **no** `blur-type/text/power`; name redaction
  present while playing and absent once `over`; mana redaction present while
  `manaHidden`. Blur and scanner tests stay green (default `mode='blur'`).
- **Browser verification:** after `npm run build`, run the dev preview and screenshot
  a mosaic round to confirm dark tiles uncover with the amber flash and that the name
  stays hidden, then confirm blur and scanner rounds still look correct (real render,
  not just mocked tests).

## Out of Scope

- No new leaderboard / pool / schema changes (scoring and boards unchanged).
- No per-mode difficulty tuning, settings toggle, or user preference to pick a mode.
- No change to the 90s game clock, summon screen, or answer options.
