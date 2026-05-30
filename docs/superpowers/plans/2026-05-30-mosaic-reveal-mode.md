# Mosaic Reveal Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third card-reveal animation ("mosaic") — a 4×6 grid of 24 tiles that uncover one every 0.5s over 12s — that rotates per round with the existing blur and scanner modes.

**Architecture:** The engine stays pure and unit-tested: new helpers `tilesRevealedAt` and `tileOrderFor` plus a 3-mode `revealModeFor`. `App.tsx` derives mode/tile state from the existing `useGameClock` `elapsedMs` and passes them to `CardStage`, which renders dark tile covers that flash amber and fade as they uncover. Name stays redacted throughout play; mana stays redacted for the first 5s (reusing `scanManaRevealMs`); on round end every overlay drops to show the full card.

**Tech Stack:** React + Vite + TypeScript, Zustand store, Framer Motion (`AnimatePresence`), Vitest + Testing Library.

---

### Task 1: Engine config + mode union

**Files:**
- Modify: `src/engine/types.ts` (TimeAttackConfig + DEFAULT_TIME_ATTACK_CONFIG)
- Modify: `src/engine/timeAttack.ts:5` (RevealMode type)

- [ ] **Step 1: Add config fields to `TimeAttackConfig`**

In `src/engine/types.ts`, add these three fields to the `TimeAttackConfig` interface (after `scanManaRevealMs`):

```ts
  /** Mosaic mode: grid columns and rows of equal tiles (cols*rows = total tiles). */
  mosaicCols: number;
  mosaicRows: number;
  /** Mosaic mode: interval after which one more random tile is uncovered, in ms. */
  mosaicTileMs: number;
```

- [ ] **Step 2: Add defaults to `DEFAULT_TIME_ATTACK_CONFIG`**

In the same file, add to the `DEFAULT_TIME_ATTACK_CONFIG` object (after `scanManaRevealMs: 5000,`):

```ts
  mosaicCols: 4,
  mosaicRows: 6,
  mosaicTileMs: 500,
```

- [ ] **Step 3: Widen the `RevealMode` union**

In `src/engine/timeAttack.ts`, change line 5:

```ts
export type RevealMode = 'blur' | 'scanner' | 'mosaic';
```

- [ ] **Step 4: Verify the build still compiles**

Run: `npm run build`
Expected: PASS (no type errors; `revealModeFor` still returns the narrower `'blur' | 'scanner'` subset, all existing callers unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/engine/types.ts src/engine/timeAttack.ts
git commit -m "feat: add mosaic mode config + reveal-mode union"
```

---

### Task 2: Engine — `tilesRevealedAt`

**Files:**
- Modify: `src/engine/timeAttack.ts` (new export)
- Test: `src/engine/timeAttack.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/engine/timeAttack.test.ts`, add `tilesRevealedAt` to the import on line 2, then add this block after the `scanProgressAt` describe:

```ts
describe('tilesRevealedAt', () => {
  it('reveals nothing at or before t=0', () => {
    expect(tilesRevealedAt(0)).toBe(0);
    expect(tilesRevealedAt(-500)).toBe(0);
  });

  it('reveals one more tile every mosaicTileMs', () => {
    expect(tilesRevealedAt(CFG.mosaicTileMs)).toBe(1);
    expect(tilesRevealedAt(CFG.mosaicTileMs * 5)).toBe(5);
  });

  it('caps at the full tile count', () => {
    const total = CFG.mosaicCols * CFG.mosaicRows;
    expect(tilesRevealedAt(CFG.mosaicTileMs * total)).toBe(total);
    expect(tilesRevealedAt(CFG.mosaicTileMs * total + 9999)).toBe(total);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/engine/timeAttack.test.ts -t tilesRevealedAt`
Expected: FAIL with "tilesRevealedAt is not a function" / import error.

- [ ] **Step 3: Write the implementation**

In `src/engine/timeAttack.ts`, add after `scanProgressAt`:

```ts
/** Mosaic-mode: number of tiles uncovered so far — one per mosaicTileMs, capped at cols*rows. */
export function tilesRevealedAt(
  elapsedMs: number,
  config: TimeAttackConfig = DEFAULT_TIME_ATTACK_CONFIG,
): number {
  const tileCount = config.mosaicCols * config.mosaicRows;
  if (elapsedMs <= 0) return 0;
  return Math.min(tileCount, Math.floor(elapsedMs / config.mosaicTileMs));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/engine/timeAttack.test.ts -t tilesRevealedAt`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/timeAttack.ts src/engine/timeAttack.test.ts
git commit -m "feat: tilesRevealedAt mosaic reveal cadence"
```

---

### Task 3: Engine — `tileOrderFor`

**Files:**
- Modify: `src/engine/timeAttack.ts` (new export)
- Test: `src/engine/timeAttack.test.ts`

- [ ] **Step 1: Write the failing test**

Add `tileOrderFor` to the import on line 2 of `src/engine/timeAttack.test.ts`, then add after the `scanAngleFor` describe:

```ts
describe('tileOrderFor', () => {
  it('returns a valid permutation of [0..tileCount-1]', () => {
    const order = tileOrderFor(42, 0, 24);
    expect(order.length).toBe(24);
    expect([...order].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 24 }, (_, i) => i),
    );
  });

  it('is deterministic for the same seed + round', () => {
    expect(tileOrderFor(12345, 3, 24)).toEqual(tileOrderFor(12345, 3, 24));
  });

  it('varies across rounds for one game seed', () => {
    expect(tileOrderFor(42, 0, 24)).not.toEqual(tileOrderFor(42, 1, 24));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/engine/timeAttack.test.ts -t tileOrderFor`
Expected: FAIL with "tileOrderFor is not a function" / import error.

- [ ] **Step 3: Write the implementation**

In `src/engine/timeAttack.ts`, add after `tilesRevealedAt`:

```ts
/**
 * Deterministic pseudo-random uncover order for mosaic tiles: a permutation of
 * [0..tileCount-1] derived from (seed, roundIndex). Stable across re-renders for a
 * given input (no flicker mid-round), but different from card to card.
 */
export function tileOrderFor(seed: number, roundIndex: number, tileCount: number): number[] {
  const keyed = Array.from({ length: tileCount }, (_, t) => {
    const x =
      Math.sin(seed * 374761393 + roundIndex * 668265263 + (t + 1) * 982451653) * 43758.5453;
    return { t, k: x - Math.floor(x) };
  });
  keyed.sort((a, b) => a.k - b.k);
  return keyed.map((e) => e.t);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/engine/timeAttack.test.ts -t tileOrderFor`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/timeAttack.ts src/engine/timeAttack.test.ts
git commit -m "feat: deterministic mosaic tile uncover order"
```

---

### Task 4: Component — `CardStage` mosaic rendering

**Files:**
- Modify: `src/scene/CardStage.tsx`
- Test: `src/scene/CardStage.test.tsx`

- [ ] **Step 1: Write the failing component tests**

In `src/scene/CardStage.test.tsx`, add after the `CardStage scanner mode` describe (before the blur describe):

```tsx
const IDENTITY = Array.from({ length: 24 }, (_, i) => i);

describe('CardStage mosaic mode', () => {
  beforeEach(() => seedRound('playing'));

  it('renders the card image and (tileCount - tilesRevealed) tile covers, no stage blurs', () => {
    render(<CardStage mode="mosaic" stage={0} tileOrder={IDENTITY} tilesRevealed={4} />);
    expect(screen.getByTestId('card-image')).toBeTruthy();
    expect(screen.getAllByTestId('mosaic-tile').length).toBe(20);
    expect(screen.queryByTestId('blur-type')).toBeNull();
    expect(screen.queryByTestId('blur-text')).toBeNull();
    expect(screen.queryByTestId('blur-power')).toBeNull();
  });

  it('keeps the name redacted while playing', () => {
    render(<CardStage mode="mosaic" stage={0} tileOrder={IDENTITY} tilesRevealed={4} />);
    expect(screen.getByTestId('blur-name')).toBeTruthy();
  });

  it('redacts the mana cost while manaHidden, then reveals it', () => {
    const { rerender } = render(
      <CardStage mode="mosaic" stage={0} tileOrder={IDENTITY} tilesRevealed={2} manaHidden />,
    );
    expect(screen.getByTestId('blur-mana')).toBeTruthy();
    rerender(
      <CardStage mode="mosaic" stage={0} tileOrder={IDENTITY} tilesRevealed={6} manaHidden={false} />,
    );
    expect(screen.queryByTestId('blur-mana')).toBeNull();
  });

  it('drops all tiles and the name when the round is over', () => {
    seedRound('won');
    render(<CardStage mode="mosaic" stage={5} tileOrder={IDENTITY} tilesRevealed={24} />);
    expect(screen.queryByTestId('mosaic-tile')).toBeNull();
    expect(screen.queryByTestId('blur-name')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/scene/CardStage.test.tsx -t "mosaic mode"`
Expected: FAIL — `mode="mosaic"` not assignable / no `mosaic-tile` elements rendered.

- [ ] **Step 3: Widen the props and add grid constants**

In `src/scene/CardStage.tsx`, add module-level constants below the imports (after `RARITY_GLOW`):

```ts
// Mosaic grid (layout). Must match mosaicCols/mosaicRows in DEFAULT_TIME_ATTACK_CONFIG.
const MOSAIC_COLS = 4;
const MOSAIC_ROWS = 6;
const MOSAIC_TILES = MOSAIC_COLS * MOSAIC_ROWS;
const MOSAIC_IDENTITY = Array.from({ length: MOSAIC_TILES }, (_, i) => i);
```

Then change the props block (currently lines 82-96) to:

```tsx
export function CardStage({
  stage,
  wide = false,
  mode = 'blur',
  progress = 0,
  angle = 0,
  manaHidden = false,
  tileOrder = MOSAIC_IDENTITY,
  tilesRevealed = 0,
}: {
  stage: RevealStage;
  wide?: boolean;
  mode?: 'blur' | 'scanner' | 'mosaic';
  progress?: number;
  angle?: number;
  manaHidden?: boolean;
  tileOrder?: number[];
  tilesRevealed?: number;
}) {
```

- [ ] **Step 4: Add the mosaic branch to the render**

In `src/scene/CardStage.tsx`, the render currently has `{mode === 'scanner' ? ( … ) : ( …blur… )}` inside `<AnimatePresence>`. Change the `scanner` ternary's else-arm into a `mode === 'mosaic'` branch followed by the blur branch. Replace the closing `) : (` that precedes the blur branch (currently line 179) with:

```tsx
          ) : mode === 'mosaic' ? (
            <>
              {!over &&
                Array.from({ length: MOSAIC_TILES }, (_, t) => {
                  const step = tileOrder.indexOf(t);
                  if (step >= 0 && step < tilesRevealed) return null;
                  const row = Math.floor(t / MOSAIC_COLS);
                  const col = t % MOSAIC_COLS;
                  return (
                    <motion.div
                      key={`tile-${t}`}
                      data-testid="mosaic-tile"
                      data-tile={t}
                      style={{
                        position: 'absolute',
                        top: `${(row / MOSAIC_ROWS) * 100}%`,
                        left: `${(col / MOSAIC_COLS) * 100}%`,
                        width: `${100 / MOSAIC_COLS}%`,
                        height: `${100 / MOSAIC_ROWS}%`,
                        backgroundColor: '#08060c',
                      }}
                      initial={{ opacity: 1 }}
                      exit={{
                        backgroundColor: ['#08060c', '#ffd79a', 'rgba(0,0,0,0)'],
                        opacity: [1, 1, 0],
                      }}
                      transition={{ duration: 0.45 }}
                    />
                  );
                })}
              {blurName && (
                <Blur
                  key="name"
                  testid="blur-name"
                  style={{ top: '3.2%', left: '5%', width: '60%', height: '6.5%', zIndex: 2 }}
                />
              )}
              {!over && manaHidden && (
                <Blur
                  key="mana"
                  testid="blur-mana"
                  style={{ top: '3.2%', left: '58%', width: '37%', height: '6.5%', zIndex: 2 }}
                />
              )}
            </>
          ) : (
```

(The existing blur branch that follows is unchanged.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/scene/CardStage.test.tsx`
Expected: PASS (mosaic, scanner, and blur describes all green).

- [ ] **Step 6: Verify the build compiles**

Run: `npm run build`
Expected: PASS (App still passes `mode='blur'|'scanner'`, a subset of the widened prop).

- [ ] **Step 7: Commit**

```bash
git add src/scene/CardStage.tsx src/scene/CardStage.test.tsx
git commit -m "feat: mosaic tile reveal rendering in CardStage"
```

---

### Task 5: Engine — 3-mode rotation in `revealModeFor`

**Files:**
- Modify: `src/engine/timeAttack.ts:124-127` (revealModeFor)
- Test: `src/engine/timeAttack.test.ts:210-223`

- [ ] **Step 1: Replace the existing `revealModeFor` tests**

In `src/engine/timeAttack.test.ts`, replace the whole `describe('revealModeFor', …)` block (lines 210-223) with:

```ts
describe('revealModeFor', () => {
  it('rotates blur → scanner → mosaic with offset 0', () => {
    expect(revealModeFor(0, 0)).toBe('blur');
    expect(revealModeFor(1, 0)).toBe('scanner');
    expect(revealModeFor(2, 0)).toBe('mosaic');
    expect(revealModeFor(3, 0)).toBe('blur');
  });

  it('offset shifts which mode is round 1', () => {
    expect(revealModeFor(0, 1)).toBe('scanner');
    expect(revealModeFor(0, 2)).toBe('mosaic');
  });

  it('wraps every 3 rounds', () => {
    expect(revealModeFor(6, 2)).toBe(revealModeFor(0, 2));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/engine/timeAttack.test.ts -t revealModeFor`
Expected: FAIL — `revealModeFor(2, 0)` currently returns `'blur'`, not `'mosaic'`.

- [ ] **Step 3: Implement 3-mode rotation**

In `src/engine/timeAttack.ts`, replace the `revealModeFor` function (lines 124-127) with:

```ts
const REVEAL_MODES: RevealMode[] = ['blur', 'scanner', 'mosaic'];

/** Which reveal animation a round uses: strict rotation blur→scanner→mosaic; offset shifts round 1. */
export function revealModeFor(roundIndex: number, offset: 0 | 1 | 2): RevealMode {
  return REVEAL_MODES[(roundIndex + offset) % REVEAL_MODES.length];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/engine/timeAttack.test.ts -t revealModeFor`
Expected: PASS.

- [ ] **Step 5: Verify the build compiles**

Run: `npm run build`
Expected: PASS (`App.tsx` passes `revealParity: 0|1`, assignable to the `0|1|2` offset param; `mode` is now `RevealMode`, accepted by the widened `CardStage` prop from Task 4).

- [ ] **Step 6: Commit**

```bash
git add src/engine/timeAttack.ts src/engine/timeAttack.test.ts
git commit -m "feat: rotate three reveal modes per round"
```

---

### Task 6: Store + App wiring

**Files:**
- Modify: `src/state/gameStore.ts:27-28, 103, 134, 203`
- Modify: `src/App.tsx:7, 198, 208, 255, 305`

- [ ] **Step 1: Rename the store field type**

In `src/state/gameStore.ts`, replace lines 27-28:

```ts
  /** Reveal-mode rotation offset for this game (0/1/2 = which mode is round 1). */
  revealOffset: 0 | 1 | 2;
```

- [ ] **Step 2: Update the initial value**

In `src/state/gameStore.ts`, change line 103 from `revealParity: 0,` to:

```ts
  revealOffset: 0,
```

- [ ] **Step 3: Roll a 3-way offset in `selectPool`**

In `src/state/gameStore.ts`, change line 134 from `revealParity: (Math.random() < 0.5 ? 0 : 1) as 0 | 1,` to:

```ts
        revealOffset: Math.floor(Math.random() * 3) as 0 | 1 | 2,
```

- [ ] **Step 4: Reset the offset**

In `src/state/gameStore.ts`, in the `reset` action (around line 203) change `revealParity: 0,` to:

```ts
      revealOffset: 0,
```

- [ ] **Step 5: Update the App import and selectors**

In `src/App.tsx` line 7, add the two new engine helpers:

```ts
import { stageAt, scanProgressAt, revealModeFor, scanAngleFor, tilesRevealedAt, tileOrderFor } from './engine/timeAttack';
```

Change line 198 from `const revealParity = useGameStore((s) => s.revealParity);` to:

```ts
  const revealOffset = useGameStore((s) => s.revealOffset);
```

Change line 208 from `const mode = revealModeFor(roundIndex, revealParity);` to:

```ts
  const mode = revealModeFor(roundIndex, revealOffset);
```

Then add, right after the `scanManaHidden` line (211):

```ts
  const tileCount = config.mosaicCols * config.mosaicRows;
  const tilesRevealed = playingNow ? tilesRevealedAt(elapsedMs, config) : tileCount;
  const tileOrder = tileOrderFor(revealSeed, roundIndex, tileCount);
```

- [ ] **Step 6: Pass the tile props to both CardStage call sites**

In `src/App.tsx`, change the portrait call (line 255) to:

```tsx
        <CardStage stage={playingNow ? stage : 5} mode={mode} progress={scanProgress} angle={scanAngle} manaHidden={scanManaHidden} tileOrder={tileOrder} tilesRevealed={tilesRevealed} />
```

and the wide call (line 305) to:

```tsx
                    <CardStage stage={playingNow ? stage : 5} mode={mode} progress={scanProgress} angle={scanAngle} manaHidden={scanManaHidden} tileOrder={tileOrder} tilesRevealed={tilesRevealed} wide />
```

- [ ] **Step 7: Run the full test suite and build**

Run: `npm run build && npm test`
Expected: PASS — no references to `revealParity` remain (`grep -rn revealParity src` returns nothing), all tests green.

- [ ] **Step 8: Commit**

```bash
git add src/state/gameStore.ts src/App.tsx
git commit -m "feat: wire mosaic mode into store rotation and CardStage"
```

---

### Task 7: Browser verification

**Files:** none (manual/preview verification).

- [ ] **Step 1: Build to confirm a clean production compile**

Run: `npm run build`
Expected: PASS (`tsc -b && vite build`, no errors).

- [ ] **Step 2: Verify a mosaic round renders (preview)**

Start the dev preview. Note the preview gotchas from the architecture memory: the preview renderer often reports the page `hidden`, throttling `requestAnimationFrame`, so timed animations may not advance and screenshots can time out. Use portrait sizing (`preview_resize` mobile) so `CardStage` renders outside the stuck playing overlay, reload + start a few times (round-1 mode is 1-in-3) until a mosaic round appears, and confirm via DOM:

- `[data-testid=mosaic-tile]` covers are present at t≈0 (count near 24), `[data-testid=blur-name]` present, `[data-testid=blur-mana]` present while early.

- [ ] **Step 3: Eyeball the animation in a real browser tab**

Run `npm run dev`, open the local URL in a normal browser tab (not the throttled preview), play a mosaic round and confirm: tiles uncover one-by-one with a brief amber flash, the name never appears during play, mana stays hidden for the first ~5s, and on guess/timeout the full card incl. name is shown. Re-check that a blur round and a scanner round still look correct (no regression).

- [ ] **Step 4: Update the architecture memory**

Update `/home/pete/.claude/projects/-home-pete-Schreibtisch-GuessTheCard/memory/project_current_architecture.md`: the game now has THREE alternating reveal modes (blur / scanner / mosaic), rotation via `revealModeFor(roundIndex, offset:0|1|2)` and store field `revealOffset` (was `revealParity`), plus engine helpers `tilesRevealedAt` and `tileOrderFor` and config `mosaicCols/mosaicRows/mosaicTileMs`.
