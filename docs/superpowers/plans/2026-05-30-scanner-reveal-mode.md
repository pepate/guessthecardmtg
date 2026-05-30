# Scanner Reveal Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second, alternating card-reveal animation ("scanner") that sweeps a dark cover off the card along a random angle behind a glowing amber edge over 12s, while keeping the card name hidden until the round ends.

**Architecture:** Pure engine helpers compute reveal mode, scan progress, and scan angle; the Zustand store holds two per-game random fields (`revealParity`, `revealSeed`); `App` derives `mode`/`progress`/`angle` from the existing rAF clock and passes them to `CardStage`, which branches between the unchanged blur reveal and the new scanner overlay. Scoring, round length, and game flow are unchanged.

**Tech Stack:** React + TypeScript, Zustand, Framer Motion, Vitest + @testing-library/react (jsdom).

---

## File Structure

- `src/engine/types.ts` — add `scanRevealMs` to `TimeAttackConfig` + default.
- `src/engine/timeAttack.ts` — add pure helpers `scanProgressAt`, `revealModeFor`, `scanAngleFor`.
- `src/engine/timeAttack.test.ts` — unit tests for the three helpers.
- `src/state/gameStore.ts` — add `revealParity` + `revealSeed` state, set in `selectPool`, cleared in `reset`.
- `src/scene/CardStage.tsx` — add `mode`/`progress`/`angle` props; scanner branch.
- `src/scene/CardStage.test.tsx` — new component tests (blur unchanged, scanner overlay + name behavior).
- `src/App.tsx` — derive `mode`/`progress`/`angle`, pass to both `<CardStage>` call sites.

Conventions to follow: engine functions take `config: TimeAttackConfig = DEFAULT_TIME_ATTACK_CONFIG` as the last arg (see existing `stageAt`/`scoreAt`); component tests seed the store via `useGameStore.setState({ round: {...} })` (see `src/ui/NameChoice.test.tsx`).

---

## Task 1: Add `scanRevealMs` to the config

**Files:**
- Modify: `src/engine/types.ts:14-31`

- [ ] **Step 1: Add the field to the interface and default**

In `src/engine/types.ts`, add a doc-commented field to `TimeAttackConfig` after `stageMs` (line 15):

```ts
  /** Length of one reveal stage, in ms. */
  stageMs: number;
  /** How long the scanner-mode sweep takes to fully reveal the card, in ms. */
  scanRevealMs: number;
```

And add it to `DEFAULT_TIME_ATTACK_CONFIG` after `stageMs: 3000,`:

```ts
  stageMs: 3000,
  scanRevealMs: 12000,
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc -b`
Expected: no errors (no consumers reference `scanRevealMs` yet; adding a required field to the single literal default is complete).

- [ ] **Step 3: Commit**

```bash
git add src/engine/types.ts
git commit -m "feat: add scanRevealMs to time-attack config"
```

---

## Task 2: `scanProgressAt` engine helper

**Files:**
- Modify: `src/engine/timeAttack.ts` (add after `stageAt`, ~line 111)
- Test: `src/engine/timeAttack.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/engine/timeAttack.test.ts` (the file already imports from `./timeAttack` and `CFG` from types — extend the import line to include `scanProgressAt`):

```ts
describe('scanProgressAt', () => {
  it('is 0 at or before the start', () => {
    expect(scanProgressAt(0)).toBe(0);
    expect(scanProgressAt(-500)).toBe(0);
  });

  it('is 1 at or after scanRevealMs', () => {
    expect(scanProgressAt(CFG.scanRevealMs)).toBe(1);
    expect(scanProgressAt(CFG.scanRevealMs + 5000)).toBe(1);
  });

  it('is linear in between (half way at half the time)', () => {
    expect(scanProgressAt(CFG.scanRevealMs / 2)).toBeCloseTo(0.5, 5);
  });
});
```

Update the import at the top of the test file (line 2) to:

```ts
import { buildOptions, createRound, planGame, stageAt, scoreAt, resolveGuess, expire, scanProgressAt } from './timeAttack';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/timeAttack.test.ts -t scanProgressAt`
Expected: FAIL — `scanProgressAt is not a function` / import error.

- [ ] **Step 3: Write minimal implementation**

In `src/engine/timeAttack.ts`, add after `stageAt` (after line 111):

```ts
/** Scanner-mode reveal fraction from elapsed ms: linear 0→1 over scanRevealMs. */
export function scanProgressAt(
  elapsedMs: number,
  config: TimeAttackConfig = DEFAULT_TIME_ATTACK_CONFIG,
): number {
  if (elapsedMs <= 0) return 0;
  return Math.min(1, elapsedMs / config.scanRevealMs);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/timeAttack.test.ts -t scanProgressAt`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/timeAttack.ts src/engine/timeAttack.test.ts
git commit -m "feat: add scanProgressAt reveal-progress helper"
```

---

## Task 3: `revealModeFor` engine helper

**Files:**
- Modify: `src/engine/timeAttack.ts`
- Test: `src/engine/timeAttack.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/engine/timeAttack.test.ts`:

```ts
describe('revealModeFor', () => {
  it('strictly alternates blur/scanner with parity 0 (blur first)', () => {
    expect(revealModeFor(0, 0)).toBe('blur');
    expect(revealModeFor(1, 0)).toBe('scanner');
    expect(revealModeFor(2, 0)).toBe('blur');
    expect(revealModeFor(3, 0)).toBe('scanner');
  });

  it('flips which mode is first with parity 1 (scanner first)', () => {
    expect(revealModeFor(0, 1)).toBe('scanner');
    expect(revealModeFor(1, 1)).toBe('blur');
    expect(revealModeFor(2, 1)).toBe('scanner');
  });
});
```

Add `revealModeFor` (and, anticipating Task 4, `scanAngleFor`) to the test import line:

```ts
import { buildOptions, createRound, planGame, stageAt, scoreAt, resolveGuess, expire, scanProgressAt, revealModeFor, scanAngleFor } from './timeAttack';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/timeAttack.test.ts -t revealModeFor`
Expected: FAIL — `revealModeFor is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `src/engine/timeAttack.ts`, first add the exported type and the function. Near the top of the file (after the imports, before `shuffle`) add:

```ts
export type RevealMode = 'blur' | 'scanner';
```

Then add after `scanProgressAt`:

```ts
/** Which reveal animation a round uses: strict A/B/A/B; parity flips round 1. */
export function revealModeFor(roundIndex: number, parity: 0 | 1): RevealMode {
  return (roundIndex + parity) % 2 === 0 ? 'blur' : 'scanner';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/timeAttack.test.ts -t revealModeFor`
Expected: PASS (2 tests). (Note: the suite as a whole will still error until Task 4 adds `scanAngleFor`, because the import references it — run the `-t` filter to check this task in isolation.)

- [ ] **Step 5: Commit**

```bash
git add src/engine/timeAttack.ts src/engine/timeAttack.test.ts
git commit -m "feat: add revealModeFor alternation helper"
```

---

## Task 4: `scanAngleFor` engine helper

**Files:**
- Modify: `src/engine/timeAttack.ts`
- Test: `src/engine/timeAttack.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/engine/timeAttack.test.ts` (`scanAngleFor` is already in the import from Task 3):

```ts
describe('scanAngleFor', () => {
  it('is deterministic for the same seed + round', () => {
    expect(scanAngleFor(12345, 3)).toBe(scanAngleFor(12345, 3));
  });

  it('returns an angle in [0, 360)', () => {
    for (let i = 0; i < 10; i++) {
      const a = scanAngleFor(987, i);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(360);
    }
  });

  it('varies across rounds for one game seed', () => {
    const angles = new Set([0, 1, 2, 3, 4].map((i) => scanAngleFor(42, i)));
    expect(angles.size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/timeAttack.test.ts -t scanAngleFor`
Expected: FAIL — `scanAngleFor is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `src/engine/timeAttack.ts`, add after `revealModeFor`:

```ts
/**
 * Deterministic pseudo-random sweep angle (degrees, [0,360)) for a round.
 * Stable across re-renders for a given (seed, roundIndex) so the sweep
 * direction never changes mid-round, but varies from card to card.
 */
export function scanAngleFor(seed: number, roundIndex: number): number {
  const x = Math.sin(seed * 374761393 + roundIndex * 668265263 + 1) * 43758.5453;
  const frac = x - Math.floor(x);
  return Math.floor(frac * 360);
}
```

- [ ] **Step 4: Run the full engine suite**

Run: `npx vitest run src/engine/timeAttack.test.ts`
Expected: PASS (all existing tests plus the new `scanProgressAt`, `revealModeFor`, `scanAngleFor` suites).

- [ ] **Step 5: Commit**

```bash
git add src/engine/timeAttack.ts src/engine/timeAttack.test.ts
git commit -m "feat: add scanAngleFor deterministic angle helper"
```

---

## Task 5: Store — per-game reveal parity + seed

**Files:**
- Modify: `src/state/gameStore.ts`

- [ ] **Step 1: Add the state fields to the interface**

In `src/state/gameStore.ts`, in the `GameState` interface, after `roundIndex: number;` (line 26) add:

```ts
  /** 0-based index of the current card within the game. */
  roundIndex: number;
  /** Which reveal mode is round 1 this game (0 = blur first, 1 = scanner first). */
  revealParity: 0 | 1;
  /** Per-game seed for deterministic scanner sweep angles. */
  revealSeed: number;
```

- [ ] **Step 2: Add their initial values**

In the `create<GameState>` initial object, after `roundIndex: 0,` (line 98) add:

```ts
  roundIndex: 0,
  revealParity: 0,
  revealSeed: 0,
```

- [ ] **Step 3: Roll fresh values when a game starts**

In `selectPool`, inside the `set({ ... })` that begins the game (the block starting at line 121), add the two fields next to `roundIndex: 0,`:

```ts
        roundIndex: 0,
        revealParity: (Math.random() < 0.5 ? 0 : 1) as 0 | 1,
        revealSeed: Math.floor(Math.random() * 1_000_000),
```

- [ ] **Step 4: Reset them in `reset`**

In `reset`, in the `set({ ... })` object, after `roundIndex: 0,` (line 194) add:

```ts
      roundIndex: 0,
      revealParity: 0,
      revealSeed: 0,
```

- [ ] **Step 5: Verify it compiles and existing tests pass**

Run: `npx tsc -b && npx vitest run`
Expected: no type errors; all existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/state/gameStore.ts
git commit -m "feat: store per-game reveal parity and seed"
```

---

## Task 6: CardStage — scanner reveal branch

**Files:**
- Modify: `src/scene/CardStage.tsx`
- Test: `src/scene/CardStage.test.tsx` (create)

- [ ] **Step 1: Write the failing component tests**

Create `src/scene/CardStage.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CardStage } from './CardStage';
import { useGameStore } from '../state/gameStore';
import type { ScryfallCard } from '../scryfall/types';

const card = (name: string): ScryfallCard => ({
  id: name,
  name,
  cmc: 2,
  type_line: 'Creature',
  power: '2',
  toughness: '2',
  rarity: 'rare',
  image_uris: { normal: 'n.jpg', art_crop: 'a.jpg' },
});

function seedRound(status: 'playing' | 'won' = 'playing') {
  useGameStore.setState({
    round: {
      target: card('Llanowar Elves'),
      options: ['Llanowar Elves', 'Counterspell', 'Shock', 'Doom Blade'],
      startedAt: 0,
      status,
      guess: status === 'won' ? 'Llanowar Elves' : null,
      score: 0,
    },
  });
}

describe('CardStage scanner mode', () => {
  beforeEach(() => seedRound('playing'));

  it('renders the card image and a scan cover, no stage blurs', () => {
    render(<CardStage mode="scanner" stage={0} progress={0.4} angle={30} />);
    expect(screen.getByTestId('card-image')).toBeTruthy();
    expect(screen.getByTestId('scan-cover')).toBeTruthy();
    expect(screen.queryByTestId('blur-type')).toBeNull();
    expect(screen.queryByTestId('blur-text')).toBeNull();
    expect(screen.queryByTestId('blur-mana')).toBeNull();
    expect(screen.queryByTestId('blur-power')).toBeNull();
  });

  it('keeps the name redacted while playing', () => {
    render(<CardStage mode="scanner" stage={0} progress={0.4} angle={30} />);
    expect(screen.getByTestId('blur-name')).toBeTruthy();
  });

  it('reveals the name and drops the cover when the round is over', () => {
    seedRound('won');
    render(<CardStage mode="scanner" stage={5} progress={1} angle={30} />);
    expect(screen.queryByTestId('blur-name')).toBeNull();
    expect(screen.queryByTestId('scan-cover')).toBeNull();
  });
});

describe('CardStage blur mode (unchanged)', () => {
  beforeEach(() => seedRound('playing'));

  it('renders stage blurs and no scan cover at an early stage', () => {
    render(<CardStage mode="blur" stage={1} />);
    expect(screen.getByTestId('blur-name')).toBeTruthy();
    expect(screen.getByTestId('blur-type')).toBeTruthy();
    expect(screen.queryByTestId('scan-cover')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/scene/CardStage.test.tsx`
Expected: FAIL — `CardStage` does not accept `mode`/`progress`/`angle`, no `scan-cover` testid.

- [ ] **Step 3: Implement the scanner branch**

Edit `src/scene/CardStage.tsx`. Change the component signature (line 82) and add the scanner rendering. Replace the function signature line:

```tsx
export function CardStage({ stage, wide = false }: { stage: RevealStage; wide?: boolean }) {
```

with:

```tsx
export function CardStage({
  stage,
  wide = false,
  mode = 'blur',
  progress = 0,
  angle = 0,
}: {
  stage: RevealStage;
  wide?: boolean;
  mode?: 'blur' | 'scanner';
  progress?: number;
  angle?: number;
}) {
```

Then, inside the returned `<div style={card …}>` block, the card currently renders `<img>` followed by `<AnimatePresence>{ artOnly … blurName … }</AnimatePresence>`. Wrap the stage-specific overlays so scanner mode shows only the scan cover + name redaction. Replace the existing `<AnimatePresence>…</AnimatePresence>` block (lines 133-158) with:

```tsx
        <AnimatePresence>
          {mode === 'scanner' ? (
            <>
              {!over && (
                <motion.div
                  key="scan-cover"
                  data-testid="scan-cover"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: `linear-gradient(${angle}deg, transparent ${Math.max(0, progress * 100 - 3)}%, #ffd79a ${progress * 100}%, rgba(255,150,60,0.6) ${progress * 100 + 1}%, #07050a ${progress * 100 + 4}%, #07050a 100%)`,
                  }}
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                />
              )}
              {blurName && (
                <Blur
                  key="name"
                  testid="blur-name"
                  style={{ top: '3.2%', left: '5%', width: '60%', height: '6.5%', zIndex: 2 }}
                />
              )}
            </>
          ) : (
            <>
              {artOnly && (
                <>
                  <Mask key="m-top" style={{ top: 0, left: 0, width: '100%', height: '11.5%' }} />
                  <Mask key="m-bottom" style={{ top: '56%', left: 0, width: '100%', height: '44%' }} />
                  <Mask key="m-left" style={{ top: '11.5%', left: 0, width: '7.5%', height: '44.5%' }} />
                  <Mask key="m-right" style={{ top: '11.5%', left: '92.5%', width: '7.5%', height: '44.5%' }} />
                </>
              )}

              {blurName && (
                <Blur key="name" testid="blur-name" style={{ top: '3.2%', left: '5%', width: '60%', height: '6.5%' }} />
              )}
              {blurMana && (
                <Blur key="mana" testid="blur-mana" style={{ top: '3.2%', left: '58%', width: '37%', height: '6.5%' }} />
              )}
              {blurType && (
                <Blur key="type" testid="blur-type" style={{ top: '56.3%', left: '5%', width: '90%', height: '5.5%' }} />
              )}
              {blurText && (
                <Blur key="text" testid="blur-text" style={{ top: '62.5%', left: '5%', width: '90%', height: '26%' }} />
              )}
              {blurPower && (
                <Blur key="power" testid="blur-power" style={{ top: '88%', left: '75%', width: '18%', height: '6.5%' }} />
              )}
            </>
          )}
        </AnimatePresence>
```

Note: `blurName = !over` already exists (line 109) and is reused for both modes; the scanner name `Blur` gets `zIndex: 2` so it stays above the scan cover (the cover has no explicit z-index, so it sits below). The `RevealStage`-typed `stage` prop is still required and used by blur mode.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/scene/CardStage.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Verify whole suite + types**

Run: `npx tsc -b && npx vitest run`
Expected: no type errors; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/scene/CardStage.tsx src/scene/CardStage.test.tsx
git commit -m "feat: scanner reveal branch in CardStage"
```

---

## Task 7: Wire the mode into App

**Files:**
- Modify: `src/App.tsx` (imports ~line 7; derivations ~line 201-204; render ~line 247 and ~line 295)

- [ ] **Step 1: Import the new helpers and read store fields**

In `src/App.tsx`, change the engine import (line 7) from:

```tsx
import { stageAt } from './engine/timeAttack';
```

to:

```tsx
import { stageAt, scanProgressAt, revealModeFor, scanAngleFor } from './engine/timeAttack';
```

Add two store selectors next to the existing ones (after `const round = useGameStore((s) => s.round);`, line 196):

```tsx
  const roundIndex = useGameStore((s) => s.roundIndex);
  const revealParity = useGameStore((s) => s.revealParity);
  const revealSeed = useGameStore((s) => s.revealSeed);
```

- [ ] **Step 2: Derive mode / progress / angle**

After `const stage = stageAt(elapsedMs, config);` (line 203) add:

```tsx
  const mode = revealModeFor(roundIndex, revealParity);
  const scanProgress = playingNow ? scanProgressAt(elapsedMs, config) : 1;
  const scanAngle = scanAngleFor(revealSeed, roundIndex);
```

(`playingNow` is defined on the next line in the current file — move these three lines to immediately after the `playingNow` declaration on line 204 so `playingNow` is in scope.)

- [ ] **Step 3: Pass props to both CardStage call sites**

Replace the portrait call site (line 247):

```tsx
      {round && !(wide && phase === 'playing') && <CardStage stage={playingNow ? stage : 5} />}
```

with:

```tsx
      {round && !(wide && phase === 'playing') && (
        <CardStage stage={playingNow ? stage : 5} mode={mode} progress={scanProgress} angle={scanAngle} />
      )}
```

Replace the wide call site (line 295):

```tsx
                  {round && <CardStage stage={playingNow ? stage : 5} wide />}
```

with:

```tsx
                  {round && (
                    <CardStage stage={playingNow ? stage : 5} mode={mode} progress={scanProgress} angle={scanAngle} wide />
                  )}
```

- [ ] **Step 4: Verify build + tests**

Run: `npm run build && npx vitest run`
Expected: `tsc -b && vite build` succeeds; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: alternate scanner and blur reveal per round"
```

---

## Task 8: Browser verification

**Files:** none (manual verification via preview).

- [ ] **Step 1: Start the dev server**

Use the preview tooling (`preview_start`) to launch the Vite dev server.

- [ ] **Step 2: Play a game and observe alternation**

Start a game (pick a pool). Watch consecutive rounds: one round should reveal via stage-based blur, the next via the amber scanner sweep at a random angle. Because the starting mode is random per game, restart once to confirm both orders occur.

- [ ] **Step 3: Confirm the scanner specifics**

On a scanner round verify: the card starts fully covered, the amber glowing edge sweeps across at an angle and fully reveals the art/type/mana/text by ~12s, and the **name stays redacted** throughout play. After answering (or letting it time out), confirm the cover drops and the **name is revealed**.

- [ ] **Step 4: Screenshot proof**

Capture `preview_screenshot` of a mid-sweep scanner round (amber edge visible, name hidden) and of a blur round, to confirm both modes render correctly. Check `preview_console_logs` for errors.

- [ ] **Step 5: Commit (only if step 3/4 required a fix)**

If verification surfaced a visual bug, fix the source, re-run `npm run build && npx vitest run`, then commit the fix. Otherwise nothing to commit.

---

## Self-Review Notes

- **Spec coverage:** cosmetic timing (Tasks 1, 7 force progress=1 when not playing), alternation + random start (Tasks 3, 5, 7), amber beam look (Task 6 gradient), random angle (Tasks 4, 7), spatial reveal with no info-gating (Task 6 scanner branch omits stage blurs/mask), name hidden-during-play / revealed-at-end (Task 6 reuses `blurName = !over` at higher z-index), linear motion (Task 2). All covered.
- **Type consistency:** `RevealMode = 'blur' | 'scanner'` defined in engine (Task 3); CardStage uses the inline union `'blur' | 'scanner'` matching those literals; `revealParity: 0 | 1` consistent across store (Task 5), `revealModeFor` (Task 3), and App (Task 7). `scanProgressAt`/`scanAngleFor`/`revealModeFor` signatures match their call sites in App.
- **No placeholders:** every code step shows full code and exact commands.
