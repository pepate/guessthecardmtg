# Configurable Reveal Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three new reveal animations (zoom, silhouette, spotlight) and a Supabase `reveal_mode` table that enables/disables each mode, with the per-round rotation cycling only through enabled modes (fallback to blur/scanner/mosaic).

**Architecture:** Pure engine helpers stay unit-tested; `CardStage` gains three render branches; a new `src/reveal/client.ts` reads the toggle table (with fallback); the store fetches the enabled set in `selectPool` and the rotation function takes the active list. Build stays green after every task (CardStage's mode-literal union is widened before the engine union; the rotation-signature change lands together with the store/App wiring).

**Tech Stack:** React + Vite + TypeScript, Zustand, Framer Motion, Supabase (`@supabase/supabase-js`), Vitest + Testing Library.

---

### Task 1: CardStage — render zoom / silhouette / spotlight

**Files:**
- Modify: `src/scene/CardStage.tsx`
- Test: `src/scene/CardStage.test.tsx`

- [ ] **Step 1: Write the failing component tests**

In `src/scene/CardStage.test.tsx`, add these three describes after the existing `CardStage mosaic mode` describe and before `CardStage blur mode (unchanged)`:

```tsx
describe('CardStage silhouette mode', () => {
  beforeEach(() => seedRound('playing'));

  it('renders a silhouette cover and name redaction, no stage blurs', () => {
    render(<CardStage mode="silhouette" stage={0} progress={0.3} />);
    expect(screen.getByTestId('card-image')).toBeTruthy();
    expect(screen.getByTestId('silhouette-cover')).toBeTruthy();
    expect(screen.getByTestId('blur-name')).toBeTruthy();
    expect(screen.queryByTestId('blur-type')).toBeNull();
  });

  it('drops the cover and name when over', () => {
    seedRound('won');
    render(<CardStage mode="silhouette" stage={5} progress={1} />);
    expect(screen.queryByTestId('silhouette-cover')).toBeNull();
    expect(screen.queryByTestId('blur-name')).toBeNull();
  });
});

describe('CardStage spotlight mode', () => {
  beforeEach(() => seedRound('playing'));

  it('renders a spotlight cover and name redaction', () => {
    render(<CardStage mode="spotlight" stage={0} progress={0.3} spotlightOrigin={{ xPct: 40, yPct: 30 }} />);
    expect(screen.getByTestId('spotlight-cover')).toBeTruthy();
    expect(screen.getByTestId('blur-name')).toBeTruthy();
  });

  it('drops the cover when over', () => {
    seedRound('won');
    render(<CardStage mode="spotlight" stage={5} progress={1} />);
    expect(screen.queryByTestId('spotlight-cover')).toBeNull();
  });
});

describe('CardStage zoom mode', () => {
  beforeEach(() => seedRound('playing'));

  it('renders both image layers and name redaction while playing', () => {
    render(<CardStage mode="zoom" stage={0} progress={0.2} zoomFocus={{ xPct: 50, yPct: 45 }} />);
    expect(screen.getByTestId('zoom-art')).toBeTruthy();
    expect(screen.getByTestId('zoom-card')).toBeTruthy();
    expect(screen.getByTestId('blur-name')).toBeTruthy();
  });

  it('redacts the rules text while zoomTextHidden, then reveals it', () => {
    const { rerender } = render(
      <CardStage mode="zoom" stage={0} progress={0.2} zoomFocus={{ xPct: 50, yPct: 45 }} zoomTextHidden />,
    );
    expect(screen.getByTestId('blur-text')).toBeTruthy();
    rerender(<CardStage mode="zoom" stage={0} progress={0.6} zoomFocus={{ xPct: 50, yPct: 45 }} zoomTextHidden={false} />);
    expect(screen.queryByTestId('blur-text')).toBeNull();
  });

  it('drops the zoom layers and name when over (full card shown)', () => {
    seedRound('won');
    render(<CardStage mode="zoom" stage={5} progress={1} zoomFocus={{ xPct: 50, yPct: 45 }} />);
    expect(screen.queryByTestId('zoom-art')).toBeNull();
    expect(screen.getByTestId('card-image')).toBeTruthy();
    expect(screen.queryByTestId('blur-name')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/scene/CardStage.test.tsx -t "silhouette mode|spotlight mode|zoom mode"`
Expected: FAIL — `mode` values not assignable / testids absent.

- [ ] **Step 3: Add layout constants**

In `src/scene/CardStage.tsx`, below the existing `MOSAIC_IDENTITY` constant, add:

```ts
// Zoom mode (layout; tunable). Art-crop zoom-in phase runs until ZOOM_CROSSFADE of the
// reveal, then crossfades to the full card scaling from ZOOM_CARD_START down to 1.
const ZOOM_START_SCALE = 2.5;
const ZOOM_CARD_START = 1.8;
const ZOOM_CROSSFADE = 0.5;
```

- [ ] **Step 4: Widen the mode prop and add the new props**

In `src/scene/CardStage.tsx`, change the props block to add `zoomFocus`, `spotlightOrigin`, `zoomTextHidden` and the three new mode literals:

```tsx
export function CardStage({
  stage,
  wide = false,
  mode = 'blur',
  progress = 0,
  angle = 0,
  manaHidden = false,
  textHidden = false,
  zoomTextHidden = false,
  tileOrder = MOSAIC_IDENTITY,
  tilesRevealed = 0,
  zoomFocus = { xPct: 50, yPct: 45 },
  spotlightOrigin = { xPct: 50, yPct: 45 },
}: {
  stage: RevealStage;
  wide?: boolean;
  mode?: 'blur' | 'scanner' | 'mosaic' | 'zoom' | 'silhouette' | 'spotlight';
  progress?: number;
  angle?: number;
  manaHidden?: boolean;
  textHidden?: boolean;
  zoomTextHidden?: boolean;
  tileOrder?: number[];
  tilesRevealed?: number;
  zoomFocus?: { xPct: number; yPct: number };
  spotlightOrigin?: { xPct: number; yPct: number };
}) {
```

- [ ] **Step 5: Compute zoom values and the art URL**

In `src/scene/CardStage.tsx`, find the existing block that computes `const over = ...` and `const hasPower = ...`. Immediately after those lines add:

```ts
  const artUrl =
    round.target.image_uris?.art_crop ??
    round.target.card_faces?.[0]?.image_uris?.art_crop ??
    cardUrl;
  const zoomPa = Math.min(1, progress / ZOOM_CROSSFADE);
  const zoomPb = Math.max(0, (progress - ZOOM_CROSSFADE) / (1 - ZOOM_CROSSFADE));
  const zoomArtScale = (1 + (1 - zoomPa) * (ZOOM_START_SCALE - 1)) * (1 - zoomPb * (1 - 1 / ZOOM_CARD_START));
  const zoomCardScale = ZOOM_CARD_START - zoomPb * (ZOOM_CARD_START - 1);
```

- [ ] **Step 6: Hide the base card image during zoom play**

In `src/scene/CardStage.tsx`, the base image is rendered as `<img src={cardUrl} alt="" data-testid="card-image" data-stage={stage} data-status={round.status} style={fillImg} />`. Change its `style` so the zoom branch can own its layers:

```tsx
          style={{ ...fillImg, opacity: mode === 'zoom' && !over ? 0 : 1 }}
```

- [ ] **Step 7: Add the three render branches**

In `src/scene/CardStage.tsx`, the AnimatePresence ternary currently ends the mosaic branch with `</>\n          ) : (` before the blur branch. Replace that single `) : (` (the one immediately before the blur `<>` containing `artOnly`) with:

```tsx
          ) : mode === 'zoom' ? (
            <>
              {!over && (
                <motion.img
                  key="zoom-card"
                  data-testid="zoom-card"
                  src={cardUrl}
                  alt=""
                  style={{ ...fillImg, transform: `scale(${zoomCardScale})`, transformOrigin: `${zoomFocus.xPct}% ${zoomFocus.yPct}%`, opacity: zoomPb }}
                  initial={{ opacity: 0 }}
                  exit={{ opacity: 0 }}
                />
              )}
              {!over && (
                <motion.img
                  key="zoom-art"
                  data-testid="zoom-art"
                  src={artUrl}
                  alt=""
                  style={{ ...fillImg, transform: `scale(${zoomArtScale})`, transformOrigin: `${zoomFocus.xPct}% ${zoomFocus.yPct}%`, opacity: 1 - zoomPb }}
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                />
              )}
              {blurName && (
                <Blur key="name" testid="blur-name" style={{ top: '3.2%', left: '5%', width: '60%', height: '6.5%', zIndex: 2 }} />
              )}
              {!over && zoomTextHidden && (
                <Blur key="text" testid="blur-text" style={{ top: '62.5%', left: '5%', width: '90%', height: '26%', zIndex: 2 }} />
              )}
              {!over && manaHidden && (
                <Blur key="mana" testid="blur-mana" style={{ top: '3.2%', left: '58%', width: '37%', height: '6.5%', zIndex: 2 }} />
              )}
            </>
          ) : mode === 'silhouette' ? (
            <>
              {!over && progress < 1 && (
                <motion.div
                  key="silhouette-cover"
                  data-testid="silhouette-cover"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    backdropFilter: `grayscale(${1 - progress}) brightness(${0.08 + progress * 0.92}) contrast(${1 + (1 - progress) * 0.4})`,
                    WebkitBackdropFilter: `grayscale(${1 - progress}) brightness(${0.08 + progress * 0.92}) contrast(${1 + (1 - progress) * 0.4})`,
                    background: `rgba(8,6,12,${Math.max(0, 0.55 * (1 - progress))})`,
                  }}
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                />
              )}
              {blurName && (
                <Blur key="name" testid="blur-name" style={{ top: '3.2%', left: '5%', width: '60%', height: '6.5%', zIndex: 2 }} />
              )}
              {!over && manaHidden && (
                <Blur key="mana" testid="blur-mana" style={{ top: '3.2%', left: '58%', width: '37%', height: '6.5%', zIndex: 2 }} />
              )}
              {!over && textHidden && (
                <Blur key="text" testid="blur-text" style={{ top: '62.5%', left: '5%', width: '90%', height: '26%', zIndex: 2 }} />
              )}
            </>
          ) : mode === 'spotlight' ? (
            <>
              {!over && progress < 1 && (
                <motion.div
                  key="spotlight-cover"
                  data-testid="spotlight-cover"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: `radial-gradient(circle at ${spotlightOrigin.xPct}% ${spotlightOrigin.yPct}%, transparent ${progress * 110}%, rgba(255,150,60,0.25) ${progress * 110 + 4}%, #07050a ${progress * 110 + 10}%)`,
                  }}
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                />
              )}
              {blurName && (
                <Blur key="name" testid="blur-name" style={{ top: '3.2%', left: '5%', width: '60%', height: '6.5%', zIndex: 2 }} />
              )}
              {!over && manaHidden && (
                <Blur key="mana" testid="blur-mana" style={{ top: '3.2%', left: '58%', width: '37%', height: '6.5%', zIndex: 2 }} />
              )}
              {!over && textHidden && (
                <Blur key="text" testid="blur-text" style={{ top: '62.5%', left: '5%', width: '90%', height: '26%', zIndex: 2 }} />
              )}
            </>
          ) : (
```

(The blur branch that follows is unchanged.)

- [ ] **Step 8: Run the tests**

Run: `npm test -- src/scene/CardStage.test.tsx`
Expected: PASS (new + existing CardStage tests all green).

- [ ] **Step 9: Verify the build**

Run: `npm run build`
Expected: PASS (App still passes `mode` of the narrower union — a subset of the widened prop).

- [ ] **Step 10: Commit**

```bash
git add src/scene/CardStage.tsx src/scene/CardStage.test.tsx
git commit -m "feat: render zoom, silhouette and spotlight reveal modes"
```

---

### Task 2: Engine — union, known-mode list, focus helpers, config

**Files:**
- Modify: `src/engine/timeAttack.ts`
- Modify: `src/engine/types.ts`
- Test: `src/engine/timeAttack.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/engine/timeAttack.test.ts`, add `zoomFocusFor`, `spotlightOriginFor`, `KNOWN_REVEAL_MODES` to the import on line 2, then add after the `tileOrderFor` describe:

```ts
describe('zoomFocusFor / spotlightOriginFor', () => {
  it('returns percentages in [0,100) and is deterministic', () => {
    const f = zoomFocusFor(42, 3);
    expect(f).toEqual(zoomFocusFor(42, 3));
    expect(f.xPct).toBeGreaterThanOrEqual(0);
    expect(f.xPct).toBeLessThan(100);
    expect(f.yPct).toBeGreaterThanOrEqual(0);
    expect(f.yPct).toBeLessThan(100);
  });

  it('spotlight differs from zoom focus for the same input', () => {
    expect(spotlightOriginFor(42, 3)).not.toEqual(zoomFocusFor(42, 3));
  });

  it('varies across rounds', () => {
    expect(zoomFocusFor(42, 0)).not.toEqual(zoomFocusFor(42, 1));
  });
});

describe('KNOWN_REVEAL_MODES', () => {
  it('lists the six known modes', () => {
    expect(KNOWN_REVEAL_MODES).toEqual(['blur', 'scanner', 'mosaic', 'zoom', 'silhouette', 'spotlight']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/engine/timeAttack.test.ts -t "zoomFocusFor|KNOWN_REVEAL_MODES"`
Expected: FAIL — not exported.

- [ ] **Step 3: Widen the union and add the known list**

In `src/engine/timeAttack.ts`, change the `RevealMode` type (line 5) and add the exported known list right after it:

```ts
export type RevealMode = 'blur' | 'scanner' | 'mosaic' | 'zoom' | 'silhouette' | 'spotlight';

/** Canonical list of every implemented reveal mode (used to validate DB toggles). */
export const KNOWN_REVEAL_MODES: RevealMode[] = ['blur', 'scanner', 'mosaic', 'zoom', 'silhouette', 'spotlight'];
```

- [ ] **Step 4: Add the focus helpers**

In `src/engine/timeAttack.ts`, add after `tileOrderFor`:

```ts
function hash01(seed: number, roundIndex: number, salt: number): number {
  const x = Math.sin(seed * 374761393 + roundIndex * 668265263 + salt) * 43758.5453;
  return x - Math.floor(x);
}

/** Deterministic zoom focus point (percentages) for a round — stable across re-renders. */
export function zoomFocusFor(seed: number, roundIndex: number): { xPct: number; yPct: number } {
  return { xPct: Math.floor(hash01(seed, roundIndex, 1) * 100), yPct: Math.floor(hash01(seed, roundIndex, 2) * 100) };
}

/** Deterministic spotlight centre (percentages) for a round — stable across re-renders. */
export function spotlightOriginFor(seed: number, roundIndex: number): { xPct: number; yPct: number } {
  return { xPct: Math.floor(hash01(seed, roundIndex, 3) * 100), yPct: Math.floor(hash01(seed, roundIndex, 4) * 100) };
}
```

- [ ] **Step 5: Add the config field**

In `src/engine/types.ts`, add to the `TimeAttackConfig` interface after `mosaicTileMs`:

```ts
  /** Zoom mode: how long the rules text stays hidden before auto-revealing, in ms. */
  zoomTextRevealMs: number;
```

and to `DEFAULT_TIME_ATTACK_CONFIG` after `mosaicTileMs: 500,`:

```ts
  zoomTextRevealMs: 7000,
```

- [ ] **Step 6: Run the tests and build**

Run: `npm test -- src/engine/timeAttack.test.ts && npm run build`
Expected: PASS. (`revealModeFor` is unchanged and still returns a `RevealMode`; the widened union flows to `CardStage`, which already accepts the three new literals from Task 1.)

- [ ] **Step 7: Commit**

```bash
git add src/engine/timeAttack.ts src/engine/types.ts src/engine/timeAttack.test.ts
git commit -m "feat: reveal-mode union, known-mode list, zoom/spotlight focus helpers + config"
```

---

### Task 3: Reveal-mode toggle client

**Files:**
- Create: `src/reveal/client.ts`
- Test: `src/reveal/client.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/reveal/client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const order = vi.fn();
const eq = vi.fn(() => ({ order }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));
let client: { from: typeof from } | null = { from };

vi.mock('../supabase/client', () => ({ getSupabase: () => client }));

import { fetchEnabledRevealModes } from './client';

beforeEach(() => {
  client = { from };
  from.mockClear();
  select.mockClear();
  eq.mockClear();
  order.mockReset();
});

describe('fetchEnabledRevealModes', () => {
  it('returns enabled known modes in order, ignoring unknown keys', async () => {
    order.mockResolvedValue({ data: [{ key: 'scanner' }, { key: 'zoom' }, { key: 'bogus' }], error: null });
    expect(await fetchEnabledRevealModes()).toEqual(['scanner', 'zoom']);
    expect(from).toHaveBeenCalledWith('reveal_mode');
    expect(eq).toHaveBeenCalledWith('enabled', true);
  });

  it('falls back to the built-in three on empty result', async () => {
    order.mockResolvedValue({ data: [], error: null });
    expect(await fetchEnabledRevealModes()).toEqual(['blur', 'scanner', 'mosaic']);
  });

  it('falls back on a query error', async () => {
    order.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await fetchEnabledRevealModes()).toEqual(['blur', 'scanner', 'mosaic']);
  });

  it('falls back on a thrown error', async () => {
    order.mockRejectedValue(new Error('network'));
    expect(await fetchEnabledRevealModes()).toEqual(['blur', 'scanner', 'mosaic']);
  });

  it('falls back when there is no Supabase client', async () => {
    client = null;
    expect(await fetchEnabledRevealModes()).toEqual(['blur', 'scanner', 'mosaic']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/reveal/client.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the client**

Create `src/reveal/client.ts`:

```ts
import { getSupabase } from '../supabase/client';
import { KNOWN_REVEAL_MODES, type RevealMode } from '../engine/timeAttack';

const FALLBACK: RevealMode[] = ['blur', 'scanner', 'mosaic'];

/** Enabled reveal modes from Supabase (ordered), filtered to known modes.
 *  Returns the built-in three on any error or an empty/unknown result. */
export async function fetchEnabledRevealModes(): Promise<RevealMode[]> {
  const c = getSupabase();
  if (!c) return FALLBACK;
  try {
    const { data, error } = await c
      .from('reveal_mode')
      .select('key')
      .eq('enabled', true)
      .order('sort_order');
    if (error || !data) return FALLBACK;
    const known = new Set<string>(KNOWN_REVEAL_MODES);
    const modes = (data as { key: string }[])
      .map((r) => r.key)
      .filter((k): k is RevealMode => known.has(k));
    return modes.length > 0 ? modes : FALLBACK;
  } catch {
    return FALLBACK;
  }
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- src/reveal/client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/reveal/client.ts src/reveal/client.test.ts
git commit -m "feat: reveal-mode toggle client with fallback"
```

---

### Task 4: Supabase `reveal_mode` migration

**Files:**
- Create: `supabase/migrations/0004_reveal_modes.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0004_reveal_modes.sql`:

```sql
-- Reveal-mode toggles: one row per implemented mode; the app reads enabled rows
-- at game start and rotates only through them (falls back to blur/scanner/mosaic).
create table if not exists reveal_mode (
  key         text primary key,
  enabled     boolean not null default true,
  sort_order  int not null default 0,
  label       text
);

alter table reveal_mode enable row level security;

drop policy if exists "reveal_mode public read" on reveal_mode;
create policy "reveal_mode public read" on reveal_mode
  for select to anon using (true);

insert into reveal_mode (key, enabled, sort_order, label) values
  ('blur',       true, 0, 'Blur'),
  ('scanner',    true, 1, 'Scanner'),
  ('mosaic',     true, 2, 'Mosaic'),
  ('zoom',       true, 3, 'Zoom'),
  ('silhouette', true, 4, 'Silhouette'),
  ('spotlight',  true, 5, 'Spotlight')
on conflict (key) do nothing;
```

- [ ] **Step 2: Apply the migration to the project**

Apply to project ref `jgapiqpaeaslfpbgiptf` via the Supabase MCP `apply_migration` tool (name `0004_reveal_modes`, the SQL above), or run it in the SQL editor / `supabase db push`. The personal access token the user supplied is one-day valid — use it transiently via env (`SUPABASE_ACCESS_TOKEN`), never written to a file or committed; the user rotates/deletes it afterward.

- [ ] **Step 3: Verify the table is publicly readable**

Run a quick check (Supabase MCP `execute_sql` or the anon client) that `select key from reveal_mode where enabled order by sort_order` returns the six rows.
Expected: `blur, scanner, mosaic, zoom, silhouette, spotlight`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0004_reveal_modes.sql
git commit -m "feat: reveal_mode toggle table migration"
```

---

### Task 5: Rotation over enabled modes + store + App wiring

**Files:**
- Modify: `src/engine/timeAttack.ts` (revealModeFor signature)
- Modify: `src/engine/timeAttack.test.ts`
- Modify: `src/state/gameStore.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Update the `revealModeFor` tests**

In `src/engine/timeAttack.test.ts`, replace the entire existing `describe('revealModeFor', …)` block with:

```ts
describe('revealModeFor', () => {
  const M3: RevealMode[] = ['blur', 'scanner', 'mosaic'];

  it('rotates through the given modes with offset 0', () => {
    expect(revealModeFor(0, 0, M3)).toBe('blur');
    expect(revealModeFor(1, 0, M3)).toBe('scanner');
    expect(revealModeFor(2, 0, M3)).toBe('mosaic');
    expect(revealModeFor(3, 0, M3)).toBe('blur');
  });

  it('offset shifts which mode is round 1', () => {
    expect(revealModeFor(0, 1, M3)).toBe('scanner');
    expect(revealModeFor(0, 2, M3)).toBe('mosaic');
  });

  it('rotates through a longer enabled list', () => {
    const all: RevealMode[] = ['blur', 'scanner', 'mosaic', 'zoom', 'silhouette', 'spotlight'];
    expect(revealModeFor(4, 0, all)).toBe('silhouette');
    expect(revealModeFor(6, 0, all)).toBe('blur');
  });

  it('degenerates to a single mode', () => {
    expect(revealModeFor(7, 0, ['zoom'])).toBe('zoom');
  });
});
```

`RevealMode` (used by the `M3` const) is exported from `./timeAttack`. If the test file doesn't already import it, add this line below the existing imports:
```ts
import type { RevealMode } from './timeAttack';
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/engine/timeAttack.test.ts -t revealModeFor`
Expected: FAIL — current `revealModeFor` takes `(roundIndex, offset)` and ignores a list.

- [ ] **Step 3: Change `revealModeFor` to take the active list**

In `src/engine/timeAttack.ts`, replace the existing `REVEAL_MODES` const + `revealModeFor` function with:

```ts
/** Which reveal animation a round uses: rotates through the enabled `modes`; offset shifts round 1. */
export function revealModeFor(roundIndex: number, offset: number, modes: RevealMode[]): RevealMode {
  return modes[(roundIndex + offset) % modes.length];
}
```

(The standalone `REVEAL_MODES` const is removed — `KNOWN_REVEAL_MODES` from Task 2 is the canonical list now.)

- [ ] **Step 4: Add `enabledModes` to the store and fetch it in selectPool**

In `src/state/gameStore.ts`:

Add the import (top of file, with the other engine import):
```ts
import { planGame, resolveGuess, expire as expireRound, type PlannedRound, type RevealMode } from '../engine/timeAttack';
import { fetchEnabledRevealModes } from '../reveal/client';
```

In the state interface, change `revealOffset: 0 | 1 | 2;` to:
```ts
  revealOffset: number;
  enabledModes: RevealMode[];
```

In the initial state, change `revealOffset: 0,` to:
```ts
  revealOffset: 0,
  enabledModes: ['blur', 'scanner', 'mosaic'],
```

Replace the body of `selectPool` (the `try` block from `const pool = ...` through the `set({...})`) with:

```ts
      const { config } = get();
      const [rawPool, enabledModes] = await Promise.all([
        fetchCandidates(selection),
        fetchEnabledRevealModes(),
      ]);
      const pool = enabledModes.includes('zoom')
        ? rawPool.filter(
            (c) => !!(c.image_uris?.art_crop ?? c.card_faces?.[0]?.image_uris?.art_crop),
          )
        : rawPool;
      if (uniqueNameCount(pool) < config.optionCount) {
        throw new Error('Not enough cards in the selected pool.');
      }
      const plan = planGame(pool, config);
      const remaining = MIN_SUMMON_MS - (Date.now() - summonStart);
      if (remaining > 0) await sleep(remaining);
      set({
        pool,
        poolKind: selection.kind,
        currentModeId: selection.kind === 'custom' ? selection.modeId : null,
        currentModeName: selection.kind === 'custom' ? selection.name : null,
        lastSelection: selection,
        plan,
        round: startPlanned(plan[0], Date.now()),
        roundIndex: 0,
        enabledModes,
        revealOffset: Math.floor(Math.random() * enabledModes.length),
        revealSeed: Math.floor(Math.random() * 1_000_000),
        gameStartedAt: Date.now(),
        correctCount: 0,
        totalScore: 0,
        earned: 0,
        phase: 'playing',
      });
```

In `reset`, change `revealOffset: 0,` to:
```ts
      revealOffset: 0,
      enabledModes: ['blur', 'scanner', 'mosaic'],
```

- [ ] **Step 5: Wire App.tsx**

In `src/App.tsx`, update the engine import to add the helpers:
```ts
import { stageAt, scanProgressAt, revealModeFor, scanAngleFor, tilesRevealedAt, tileOrderFor, zoomFocusFor, spotlightOriginFor } from './engine/timeAttack';
```

Add an `enabledModes` selector next to the other store selectors:
```ts
  const enabledModes = useGameStore((s) => s.enabledModes);
```

Change `const mode = revealModeFor(roundIndex, revealOffset);` to:
```ts
  const mode = revealModeFor(roundIndex, revealOffset, enabledModes);
```

After the existing `const tileOrder = tileOrderFor(revealSeed, roundIndex, tileCount);` line add:
```ts
  const zoomFocus = zoomFocusFor(revealSeed, roundIndex);
  const spotlightOrigin = spotlightOriginFor(revealSeed, roundIndex);
  const zoomTextHidden = playingNow && elapsedMs < config.zoomTextRevealMs;
```

Add the new props to BOTH `<CardStage … />` call sites (portrait and wide). Each currently ends with
`… manaHidden={scanManaHidden} textHidden={scanTextHidden} tileOrder={tileOrder} tilesRevealed={tilesRevealed} [wide] />`.
Insert `zoomTextHidden={zoomTextHidden} zoomFocus={zoomFocus} spotlightOrigin={spotlightOrigin}` before `tileOrder` in each:
```tsx
        <CardStage stage={playingNow ? stage : 5} mode={mode} progress={scanProgress} angle={scanAngle} manaHidden={scanManaHidden} textHidden={scanTextHidden} zoomTextHidden={zoomTextHidden} zoomFocus={zoomFocus} spotlightOrigin={spotlightOrigin} tileOrder={tileOrder} tilesRevealed={tilesRevealed} />
```
```tsx
                    <CardStage stage={playingNow ? stage : 5} mode={mode} progress={scanProgress} angle={scanAngle} manaHidden={scanManaHidden} textHidden={scanTextHidden} zoomTextHidden={zoomTextHidden} zoomFocus={zoomFocus} spotlightOrigin={spotlightOrigin} tileOrder={tileOrder} tilesRevealed={tilesRevealed} wide />
```

- [ ] **Step 6: Run the full suite and build**

Run: `npm run build && npm test`
Expected: PASS — all tests green; no `revealModeFor(` call remains with only two arguments (`grep -rn "revealModeFor(" src` shows only 3-arg calls + the definition).

- [ ] **Step 7: Commit**

```bash
git add src/engine/timeAttack.ts src/engine/timeAttack.test.ts src/state/gameStore.ts src/App.tsx
git commit -m "feat: rotate enabled reveal modes from Supabase toggles, zoom art-crop pool filter"
```

---

### Task 6: Browser verification + memory update

**Files:** none (verification) + memory file.

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 2: Eyeball the new modes in a real browser**

Run `npm run dev`, open the local URL in a normal browser tab (NOT the throttled preview — screenshots of animations time out, a known gotcha). Play and advance rounds (any answer advances the round) until each new mode appears (round-1 mode is random across the enabled set; rotation cycles all enabled modes):
- **zoom:** starts zoomed into the art (crisp, from `art_crop`), zooms out, then the full card materialises; name never shown; rules text hidden for ~7s.
- **silhouette:** card starts as a dark/desaturated silhouette and gains colour/brightness.
- **spotlight:** a growing lit circle reveals the card from a random point.
Confirm blur/scanner/mosaic still look correct (no regression).

- [ ] **Step 3: Verify the toggle works**

In Supabase, set `reveal_mode.enabled = false` for one mode (e.g. `zoom`), reload the app, start games and confirm that mode never appears; re-enable it afterwards. Also confirm that if the table is unreachable the game still runs (fallback) — e.g. temporarily point at a bad anon key in a throwaway check, or trust the unit-tested fallback.

- [ ] **Step 4: Update the architecture memory**

Update `/home/pete/.claude/projects/-home-pete-Schreibtisch-GuessTheCard/memory/project_current_architecture.md`: the game now has SIX reveal modes (blur/scanner/mosaic/zoom/silhouette/spotlight), the rotation reads the enabled set from Supabase table `reveal_mode` via `src/reveal/client.ts` `fetchEnabledRevealModes()` (fallback `blur/scanner/mosaic`), `revealModeFor(roundIndex, offset, modes)` now takes the active list, store holds `enabledModes`, zoom uses both `image_art_crop` + `image_normal` and filters the pool to art-crop cards when enabled, and zoom keeps rules text hidden `zoomTextRevealMs` (7s). Note migration `0004_reveal_modes.sql`.
