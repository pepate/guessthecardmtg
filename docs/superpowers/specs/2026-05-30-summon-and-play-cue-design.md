# Summon Screen & Play Cue — Design

**Date:** 2026-05-30
**Status:** Approved (design)
**Sub-project:** E (follow-up to A–D)

## Problem

Three start-screen polish items:

1. **Play affordance:** the pool buttons (Popular cards / All cards) don't make it
   obvious they're tappable. Add a small play icon on the right that, after a few
   seconds of inactivity, gently pulses/glows to invite a tap.
2. **Summon screen:** when a pool is picked, cards are fetched ("summoned"). Show
   rotating flavour/tip texts during this to keep the player engaged. Author **40**
   distinct texts (gameplay tips + MTG flavour).
3. **Fresh cards per restart:** the player suspects games don't reload cards (it
   feels too fast). They do — but make it perceptible.

## Findings (E3 — no correctness change needed)

`restart()` → `selectPool(lastSelection)` → `fetchCandidates()` → RPC
`get_game_cards` with `order by random()` and **no caching**. Every start (incl.
"Play again") pulls a fresh random set from the 25k-card catalogue. It only *felt*
cached because the query is fast. Making the summon screen visible (below) fixes
the perception.

## Decisions (confirmed with user)

- **Minimum summon time ≈ 1.5s** so the texts are actually seen and reloading
  feels real.
- **Play icon pulses after ≈ 4s** of inactivity; visible (static) before that.

## Design

### Play icon + pulse (`PoolSelect.tsx`, `index.css`)

- Each pool button becomes `position: relative` with a right-aligned play-triangle
  SVG (`.play-icon`, absolutely positioned, vertically centered). Label stays
  centered.
- `PoolSelect` sets a `hint` flag after a 4s `setTimeout` (cleared on unmount);
  while `hint`, the icons get `.play-hint` → a `playPulse` keyframe (opacity +
  ember glow + slight scale).

### Summon screen (`summoningTexts.ts`, `App.tsx` LoadingScreen)

- New `src/ui/summoningTexts.ts`: `SUMMONING_TEXTS: string[]` — 40 distinct
  one-liners (tips + flavour). Two of them explicitly reassure that every game
  deals new cards.
- `LoadingScreen` keeps the spinner + "Summoning cards…" header, and below shows a
  rotating line: pick a random start index, advance every ~1.9s while mounted.

### Minimum summon duration (`gameStore.ts`)

- In `selectPool`, record the load start; after fetch + `planGame`, if elapsed
  `< MIN_SUMMON_MS` (1500), `await` the remainder before switching to `playing`.
  Errors bypass the delay. (No test calls `selectPool`, so the suite is
  unaffected.)

## Out of scope

- Gameplay, scoring, RPC, leaderboard, sub-projects A–D.

## Testing

- **Unit:** `SUMMONING_TEXTS` has 40 non-empty, unique entries; `PoolSelect`
  renders a play icon per button and adds `.play-hint` after the 4s timer (fake
  timers).
- **Browser (eyeball):** play icons visible and pulsing after ~4s; clicking shows
  the summon screen with a rotating text for ≥1.5s; a new game shows different
  cards.

## Risks / notes

- The 1.5s floor adds latency to every start by design (user-approved); kept short.
- Rotation interval (~1.9s) means typically 1 text per fast load, more on slow
  networks — acceptable.
