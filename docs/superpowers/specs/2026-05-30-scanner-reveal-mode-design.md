# Scanner Reveal Mode — Design

Date: 2026-05-30
Status: Approved

## Summary

Add a second card-reveal animation ("scanner") that **complements** the existing
stage-based blur reveal rather than replacing it. The two modes alternate strictly
per round, with a random choice each game of which mode is round 1. The scanner
reveals the card spatially — a dark cover slides off along a random angle, led by a
glowing amber "energy beam" edge — over 12 seconds. The card name stays hidden
during play and is revealed at round end, exactly like the existing mode.

## Decisions

- **Cosmetic only.** Round length stays 15s and scoring is unchanged (linear
  1000→100 decay). The scanner reaches full reveal at 12s, leaving ~3s of full
  visibility before time-out. No changes to round flow, scoring, or the 90s game
  clock.
- **Alternation.** Strict A/B/A/B by round index. Which mode is round 1 is chosen
  randomly per game (`revealParity` 0/1).
- **Scan look.** "Amber Energy Beam": one dark overlay over the card image whose
  boundary slides off along a per-round random angle, led by a bright amber glowing
  line. Matches the game's gold/orange-on-near-black theme.
- **Spatial reveal, no info-stage gating.** In scanner mode the beam reveals art,
  type line, mana cost, rules text and P/T together as it passes — there is no
  stage-by-stage gating. Only the **name** is held back.
- **Name.** Hidden during play (frosted redaction over the title) even after the
  beam passes it; revealed when the round resolves (guess or time-out), same as the
  blur mode payoff.
- **Scan motion.** Linear over `scanRevealMs` (12000ms). `progress` is clamped 0..1;
  it is forced to 1 once the round is over.

## Architecture

Reuses the existing data flow: `App` drives a per-round `requestAnimationFrame`
clock (`useGameClock`) → `elapsedMs` → derived reveal values → `CardStage` props.
The store already exposes `roundIndex`. The engine stays pure and unit-tested.

### 1. Engine — `src/engine/timeAttack.ts` + `src/engine/types.ts`

- `TimeAttackConfig` gains `scanRevealMs: number`; `DEFAULT_TIME_ATTACK_CONFIG.scanRevealMs = 12000`.
- `scanProgressAt(elapsedMs, config?) → number` — linear `elapsedMs / scanRevealMs`,
  clamped to `[0, 1]` (0 at `elapsedMs <= 0`, 1 at `>= scanRevealMs`).
- `revealModeFor(roundIndex, parity) → 'blur' | 'scanner'` — `(roundIndex + parity) % 2`
  maps to the two modes; `parity` 0/1 flips which mode is round 1.
- `scanAngleFor(seed, roundIndex) → number` — deterministic pseudo-random angle in
  degrees from `(seed, roundIndex)`, stable across re-renders, varying per round.

### 2. Store — `src/state/gameStore.ts`

- Add state `revealParity: 0 | 1` and `revealSeed: number`.
- Set both to fresh random values in `selectPool` (so each new game — including
  `restart`, which re-calls `selectPool` — re-rolls them).
- Clear them in `reset`. No other store changes; `roundIndex` already drives
  alternation.

### 3. Wiring — `src/App.tsx`

- Already computes `elapsedMs`, `stage`, `playingNow`.
- Compute `mode = revealModeFor(roundIndex, revealParity)`.
- When `mode === 'scanner'`: `progress = playingNow ? scanProgressAt(elapsedMs) : 1`
  and `angle = scanAngleFor(revealSeed, roundIndex)`.
- Pass `mode`, `progress`, `angle` to both `<CardStage>` call sites (portrait and
  wide). Blur mode keeps passing `stage` exactly as today.

### 4. Component — `src/scene/CardStage.tsx`

New props: `mode: 'blur' | 'scanner'`, `progress?: number`, `angle?: number`.
Default `mode = 'blur'` so existing callers/tests are unaffected.

- **Blur mode:** unchanged — today's stage-based blur/mask overlays.
- **Scanner mode:** render the full card `<img>` (same `card-image` testid/attrs), then:
  - **Scan cover** — only while `!over`, wrapped in `AnimatePresence` so it fades out
    on round end. A `<div>` over the image with a `linear-gradient(${angle}deg, …)`
    background: transparent (revealed) → amber glow line at `progress` → dark
    `#07050a` cover. `p = progress * 100`, e.g.
    `transparent ${p-3}%, #ffd79a ${p}%, rgba(255,150,60,.6) ${p+1}%, #07050a ${p+4}% 100%`.
    A slightly blurred duplicate of the amber line provides the glow. The gradient
    string is rebuilt from `progress` each render (App re-renders ~60fps via the clock).
  - **Name redaction** — reuse the existing frosted `Blur` over the title area, at a
    **higher z-index than the scan cover**, shown while `!over` and removed on round
    end. Reuses the existing `blurName = !over` rule and exit fade.
  - No type/mana/text/power blurs and no art-mask in scanner mode.
- The rarity glow `box-shadow` applies in both modes.

## Data Flow

```
useGameClock → elapsedMs
roundIndex + revealParity → revealModeFor → mode
elapsedMs (+ over) → scanProgressAt → progress
revealSeed + roundIndex → scanAngleFor → angle
{ mode, stage, progress, angle, wide } → CardStage
```

## Error / Edge Handling

- **Very fast guess.** Cover may be barely retreated; on `over` the cover fades out
  (AnimatePresence) and the name is revealed — full card shown.
- **Time-out with no guess.** Same as fast guess: `over` true → full reveal incl. name.
- **Missing image.** Existing `if (!cardUrl)` guard is preserved for both modes.
- **Angle stability.** `scanAngleFor` is deterministic per `(seed, roundIndex)`, so
  re-renders during the round do not change the sweep direction.

## Testing

- **Engine units:** `scanProgressAt` (≤0 → 0, ≥12s → 1, midpoint ≈ 0.5);
  `revealModeFor` (alternation across indices, both parities); `scanAngleFor`
  (deterministic for fixed input, varies across round indices).
- **Component:** a scanner round renders `card-image` with **no** `blur-type/mana/
  text/power`; name redaction present while playing and absent once `over`. Blur-mode
  tests stay green (default `mode='blur'`).
- **Browser verification:** after `npm run build`, run the dev preview and screenshot
  a scanner round to confirm the amber beam renders and the name stays hidden, then
  confirm a blur round still looks correct (real render, not just mocked tests).

## Out of Scope

- No new leaderboard / pool / schema changes (scoring and boards unchanged).
- No per-mode difficulty tuning, settings toggle, or user preference to pick a mode.
- No change to the 90s game clock, summon screen, or answer options.
