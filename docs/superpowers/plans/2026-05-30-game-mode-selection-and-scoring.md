# Game-Mode Selection & Per-Mode Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Run in an isolated git worktree** (the leaderboard changes collide with the parallel custom-mode branch).

**Goal:** Shrink the game to 30s, let the player pick one reveal mode (or Random) before a game that runs entirely in that mode, and tag/rank/replay scores by reveal mode.

**Architecture:** Per-round reveal rotation is replaced by a single `gameMode` resolved at game start (Random → one concrete mode). A `game_mode` column is added to the leaderboard (orthogonal to the existing pool/mode_id axis), threaded through `submit-score`, the leaderboard client, and the game-over board; leaderboard rows show a mode badge and are clickable to replay that mode.

**Tech Stack:** React + Vite + TS, Zustand, Framer Motion, Supabase (Postgres + Deno edge function), Vitest + Testing Library.

---

### Task 1: 30-second timer

**Files:**
- Modify: `src/engine/types.ts`
- Modify: `src/ui/PoolSelect.tsx:90`

- [ ] **Step 1: Change the game duration**

In `src/engine/types.ts`, in `DEFAULT_TIME_ATTACK_CONFIG`, change `gameDurationMs: 90000,` to:

```ts
  gameDurationMs: 30000,
```

- [ ] **Step 2: Update the start-screen copy**

In `src/ui/PoolSelect.tsx`, change the line `90 seconds · guess as many as you can` to:

```tsx
          30 seconds · guess as many as you can
```

- [ ] **Step 3: Verify build + tests**

Run: `npm run build && npm test`
Expected: PASS (no test asserts the literal 90000).

- [ ] **Step 4: Commit**

```bash
git add src/engine/types.ts src/ui/PoolSelect.tsx
git commit -m "feat: shorten the game to 30 seconds"
```

---

### Task 2: Single-mode core (engine + store + App)

Replaces per-round rotation with one `gameMode` per game. Kept as one task so the types stay consistent and the build stays green.

**Files:**
- Modify: `src/engine/timeAttack.ts` (add `resolveGameMode`, remove `revealModeFor`)
- Modify: `src/engine/timeAttack.test.ts`
- Modify: `src/state/gameStore.ts`
- Create: `src/state/gameStore.test.ts` is EXISTING — modify it
- Modify: `src/App.tsx`

- [ ] **Step 1: Write the failing engine test**

In `src/engine/timeAttack.test.ts`, replace the entire `describe('revealModeFor', …)` block with:

```ts
describe('resolveGameMode', () => {
  const enabled: RevealMode[] = ['blur', 'scanner', 'mosaic', 'zoom'];

  it('returns a concrete choice unchanged', () => {
    expect(resolveGameMode('zoom', enabled)).toBe('zoom');
  });

  it('resolves "random" to a member of the enabled set', () => {
    for (let i = 0; i < 20; i++) {
      expect(enabled).toContain(resolveGameMode('random', enabled));
    }
  });

  it('falls back to blur when nothing is enabled', () => {
    expect(resolveGameMode('random', [])).toBe('blur');
  });
});
```

Update the import on line 2: remove `revealModeFor`, add `resolveGameMode`. Keep `RevealMode` imported (the `describe` uses it).

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/engine/timeAttack.test.ts -t resolveGameMode`
Expected: FAIL — `resolveGameMode` not exported.

- [ ] **Step 3: Implement in the engine**

In `src/engine/timeAttack.ts`, delete the `revealModeFor` function entirely and add:

```ts
/** Resolve the pre-game choice to a single concrete mode for the whole game.
 *  A concrete choice passes through; 'random' picks a uniformly random enabled mode. */
export function resolveGameMode(choice: RevealMode | 'random', enabled: RevealMode[]): RevealMode {
  if (choice !== 'random') return choice;
  if (enabled.length === 0) return 'blur';
  return enabled[Math.floor(Math.random() * enabled.length)];
}
```

- [ ] **Step 4: Update the store state + actions**

In `src/state/gameStore.ts`:

Update the engine import (it currently imports `type RevealMode`; add `resolveGameMode`):
```ts
import { planGame, resolveGuess, expire as expireRound, resolveGameMode, type PlannedRound, type RevealMode } from '../engine/timeAttack';
```

In the `GameState` interface, replace `revealOffset: number;` with:
```ts
  gameMode: RevealMode;
  pendingRevealChoice: RevealMode | 'random';
```
and add to the actions section (near `selectPool`):
```ts
  setRevealChoice: (choice: RevealMode | 'random') => void;
  loadRevealModes: () => Promise<void>;
```

In the initial state, replace `revealOffset: 0,` with:
```ts
  gameMode: 'blur',
  pendingRevealChoice: 'random',
```

Add the two new actions (e.g. just before `selectPool`):
```ts
  setRevealChoice(choice) {
    set({ pendingRevealChoice: choice });
  },

  async loadRevealModes() {
    set({ enabledModes: await fetchEnabledRevealModes() });
  },
```

In `selectPool`, replace the fetch/resolve block. The current body fetches `enabledModes` via `Promise.all` and filters on `enabledModes.includes('zoom')`. Replace from `const [rawPool, enabledModes] = await Promise.all([` down to the `const pool = …` assignment with:
```ts
      const [rawPool, enabledModes] = await Promise.all([
        fetchCandidates(selection),
        fetchEnabledRevealModes(),
      ]);
      const gameMode = resolveGameMode(get().pendingRevealChoice, enabledModes);
      const pool = gameMode === 'zoom'
        ? rawPool.filter(
            (c) => !!(c.image_uris?.art_crop ?? c.card_faces?.[0]?.image_uris?.art_crop),
          )
        : rawPool;
```
and in the `set({ … })` call, replace `revealOffset: Math.floor(Math.random() * enabledModes.length),` with:
```ts
        enabledModes,
        gameMode,
```
(remove the now-duplicate `enabledModes,` line that was already there — keep a single `enabledModes,` plus the new `gameMode,`).

In `reset`, replace `revealOffset: 0,` with:
```ts
      gameMode: 'blur',
      pendingRevealChoice: 'random',
```

- [ ] **Step 5: Add a store test for gameMode resolution**

In `src/state/gameStore.test.ts`, add inside the `describe('selectPool reveal modes', …)` block:

```ts
  it('resolves a concrete pendingRevealChoice into gameMode', async () => {
    (fetchCandidates as Mock).mockResolvedValue(['a', 'b', 'c', 'd'].map((n) => card(n)));
    (fetchEnabledRevealModes as Mock).mockResolvedValue(['blur', 'scanner', 'mosaic', 'silhouette']);
    useGameStore.getState().setRevealChoice('silhouette');

    await useGameStore.getState().selectPool(POPULAR);

    expect(useGameStore.getState().gameMode).toBe('silhouette');
  });

  it('resolves "random" to one of the enabled modes', async () => {
    (fetchCandidates as Mock).mockResolvedValue(['a', 'b', 'c', 'd'].map((n) => card(n)));
    (fetchEnabledRevealModes as Mock).mockResolvedValue(['scanner', 'mosaic']);
    useGameStore.getState().setRevealChoice('random');

    await useGameStore.getState().selectPool(POPULAR);

    expect(['scanner', 'mosaic']).toContain(useGameStore.getState().gameMode);
  });
```

(The existing zoom-filter test still passes: it sets no `pendingRevealChoice`, so it stays `'random'` → may or may not resolve to zoom. Make that test deterministic by adding `useGameStore.getState().setRevealChoice('zoom');` before its `selectPool` call, and assert the pool is filtered.)

- [ ] **Step 6: Wire App.tsx**

In `src/App.tsx`:
- Update the engine import on line 7: remove `revealModeFor`.
- Replace the selector `const revealOffset = useGameStore((s) => s.revealOffset);` with:
```ts
  const gameMode = useGameStore((s) => s.gameMode);
  const loadRevealModes = useGameStore((s) => s.loadRevealModes);
```
- Replace `const mode = revealModeFor(roundIndex, revealOffset, enabledModes);` with:
```ts
  const mode = gameMode;
```
- The `enabledModes` selector is no longer needed for `mode`; keep it only if still referenced — otherwise remove it. (It is not used elsewhere in App after this change; remove the `const enabledModes = …` selector line.)
- Add an effect (next to the other top-level effects in `App`) to load the toggles once on mount:
```ts
  useEffect(() => {
    void loadRevealModes();
  }, [loadRevealModes]);
```

- [ ] **Step 7: Verify build + tests**

Run: `npm run build && npm test`
Expected: PASS. `grep -rn "revealModeFor\|revealOffset" src` returns nothing.

- [ ] **Step 8: Commit**

```bash
git add src/engine/timeAttack.ts src/engine/timeAttack.test.ts src/state/gameStore.ts src/state/gameStore.test.ts src/App.tsx
git commit -m "feat: single reveal mode per game (resolve Random at start), drop rotation"
```

---

### Task 3: Pre-game reveal-mode picker

**Files:**
- Create: `src/reveal/labels.ts`
- Create: `src/ui/RevealModePicker.tsx`
- Create: `src/ui/RevealModePicker.test.tsx`
- Modify: `src/ui/PoolSelect.tsx`

- [ ] **Step 1: Add the label map**

Create `src/reveal/labels.ts`:

```ts
import type { RevealMode } from '../engine/timeAttack';

export const REVEAL_MODE_LABELS: Record<RevealMode, string> = {
  blur: 'Blur',
  scanner: 'Scanner',
  mosaic: 'Mosaic',
  zoom: 'Zoom',
  silhouette: 'Silhouette',
  spotlight: 'Spotlight',
};
```

- [ ] **Step 2: Write the failing picker test**

Create `src/ui/RevealModePicker.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RevealModePicker } from './RevealModePicker';
import { useGameStore } from '../state/gameStore';

beforeEach(() => {
  useGameStore.setState({ enabledModes: ['blur', 'scanner', 'zoom'], pendingRevealChoice: 'random' });
});

describe('RevealModePicker', () => {
  it('renders Random plus each enabled mode and reflects the selection', () => {
    render(<RevealModePicker />);
    expect(screen.getByRole('button', { name: /random/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^scanner$/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^zoom$/i }));
    expect(useGameStore.getState().pendingRevealChoice).toBe('zoom');
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test -- src/ui/RevealModePicker.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 4: Implement the picker**

Create `src/ui/RevealModePicker.tsx`:

```tsx
import { useGameStore } from '../state/gameStore';
import { REVEAL_MODE_LABELS } from '../reveal/labels';
import type { RevealMode } from '../engine/timeAttack';

export function RevealModePicker() {
  const enabledModes = useGameStore((s) => s.enabledModes);
  const pending = useGameStore((s) => s.pendingRevealChoice);
  const setRevealChoice = useGameStore((s) => s.setRevealChoice);

  const choices: (RevealMode | 'random')[] = ['random', ...enabledModes];

  return (
    <div
      data-testid="reveal-picker"
      style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}
    >
      {choices.map((c) => {
        const active = c === pending;
        return (
          <button
            key={c}
            type="button"
            onClick={() => setRevealChoice(c)}
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
              padding: '6px 12px',
              borderRadius: 999,
              cursor: 'pointer',
              color: active ? 'var(--ink-0)' : 'var(--ink-2)',
              background: active ? 'rgba(255,138,60,0.18)' : 'rgba(20,17,28,0.5)',
              border: `1px solid ${active ? 'var(--ember)' : 'var(--line)'}`,
            }}
          >
            {c === 'random' ? 'Random' : REVEAL_MODE_LABELS[c]}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Mount the picker in PoolSelect**

In `src/ui/PoolSelect.tsx`, add the import:
```tsx
import { RevealModePicker } from './RevealModePicker';
```
and render it directly above the `Popular cards` button (after the `challenge` block, before the first `<button style={btn} …>`):
```tsx
      <RevealModePicker />
```

- [ ] **Step 6: Run tests + build**

Run: `npm test -- src/ui/RevealModePicker.test.tsx && npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/reveal/labels.ts src/ui/RevealModePicker.tsx src/ui/RevealModePicker.test.tsx src/ui/PoolSelect.tsx
git commit -m "feat: pre-game reveal-mode picker (Random + enabled modes)"
```

---

### Task 4: Leaderboard `game_mode` migration

**Files:**
- Create: `supabase/migrations/0005_game_mode.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0005_game_mode.sql`:

```sql
-- Tag each score with the reveal mode it was played in (orthogonal to pool/mode_id).
alter table leaderboard add column if not exists game_mode text;

create index if not exists leaderboard_gamemode_score_idx
  on leaderboard (game_mode, score desc, created_at);

-- Re-create the public read view so it exposes game_mode (drop+create; keep the
-- existing column set from 0003 and add game_mode).
drop view if exists leaderboard_top;
create view leaderboard_top as
  select id, name, score, correct, pool, mode_id, game_mode, country, created_at
  from leaderboard;
grant select on leaderboard_top to anon;
```

(If 0003's `leaderboard_top` selected a different column set, mirror it and just add `game_mode` — verify against `supabase/migrations/0003_custom_modes.sql` before applying.)

- [ ] **Step 2: Apply to the project**

Apply migration `0005_game_mode` to project `jgapiqpaeaslfpbgiptf`. The Supabase MCP server is unauthenticated here, so apply via the Management API with the user-supplied one-day token used transiently (never written to a file/commit):
```bash
curl -s -X POST "https://api.supabase.com/v1/projects/jgapiqpaeaslfpbgiptf/database/query" \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  --data "$(jq -Rs '{query: .}' supabase/migrations/0005_game_mode.sql)"
```
Verify: `select column_name from information_schema.columns where table_name='leaderboard' and column_name='game_mode';` returns one row, and `select game_mode from leaderboard_top limit 1;` succeeds (anon view exposes it).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0005_game_mode.sql
git commit -m "feat: leaderboard game_mode column + view"
```

---

### Task 5: `submit-score` accepts game_mode

**Files:**
- Modify: `supabase/functions/submit-score/index.ts`

- [ ] **Step 1: Validate + persist game_mode**

In `supabase/functions/submit-score/index.ts`:

Add a known-modes constant near the top (after imports):
```ts
const GAME_MODES = ['blur', 'scanner', 'mosaic', 'zoom', 'silhouette', 'spotlight'];
```

After the `validScore` check (right after `const correct = body.correct as number;`), add:
```ts
  const gameMode = body.game_mode;
  if (typeof gameMode !== 'string' || !GAME_MODES.includes(gameMode)) {
    return json({ ok: false, reason: 'game-mode' }, 400);
  }
```

Add `game_mode: gameMode` to the insert object:
```ts
    .insert({ name, score, correct, pool, mode_id: modeId, game_mode: gameMode, country, ip_hash: ipHash })
```

In the rank query, also scope by game_mode so the rank is per-mode. Replace:
```ts
  rankQuery = modeId ? rankQuery.eq('mode_id', modeId) : rankQuery.eq('pool', pool);
```
with:
```ts
  rankQuery = modeId ? rankQuery.eq('mode_id', modeId) : rankQuery.eq('pool', pool);
  rankQuery = rankQuery.eq('game_mode', gameMode);
```

- [ ] **Step 2: Verify the function deploys / type-checks**

This Deno function isn't covered by the vitest suite. Verify by reading the diff for the four edits above and (if the Supabase CLI is available) `supabase functions deploy submit-score`, or note that it deploys on the next push. Confirm the JSON shape is unchanged on success.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/submit-score/index.ts
git commit -m "feat: submit-score validates and stores game_mode, ranks per mode"
```

---

### Task 6: Leaderboard client/types + game-over board threading

**Files:**
- Modify: `src/leaderboard/types.ts`
- Modify: `src/leaderboard/client.ts`
- Modify: `src/ui/GameOverLeaderboard.tsx`
- Modify: `src/ui/GameOver.tsx`

- [ ] **Step 1: Extend the types**

In `src/leaderboard/types.ts`, add `import type { RevealMode } from '../engine/timeAttack';` at the top, then:
- add to `GlobalEntry`: `gameMode: RevealMode | null;`
- add to `SubmitPayload`: `gameMode: RevealMode;`

- [ ] **Step 2: Thread game_mode through the client**

In `src/leaderboard/client.ts`:

Add `import type { RevealMode } from '../engine/timeAttack';`.

Add `game_mode` to the `Row` interface (`game_mode: string | null;`) and map it in `toEntry`:
```ts
    gameMode: (r.game_mode as RevealMode | null) ?? null,
```
Add `game_mode` to every `.select('id,name,score,correct,pool,country,created_at')` string → `'id,name,score,correct,pool,game_mode,country,created_at'` (in `fetchTopScores` and `fetchModeTopScores`).

Give `fetchTopScores` and `fetchProjectedRank` an optional trailing `gameMode?: RevealMode` param and apply it. For `fetchTopScores`, after `.eq('pool', pool)` add:
```ts
  if (gameMode) q = q.eq('game_mode', gameMode);
```
For `fetchProjectedRank`, build both queries with the filter; after each `.eq('pool', pool)` chain add `.eq('game_mode', gameMode)` guarded by `if (gameMode)` (assign the query to a `let` first, e.g.:
```ts
  let higherQ = c.from('leaderboard_top').select('id', { count: 'exact', head: true }).eq('pool', pool).gt('score', score);
  if (gameMode) higherQ = higherQ.eq('game_mode', gameMode);
  const higher = await higherQ;
  let allQ = c.from('leaderboard_top').select('id', { count: 'exact', head: true }).eq('pool', pool);
  if (gameMode) allQ = allQ.eq('game_mode', gameMode);
  const all = await allQ;
```
).

In `submitScore`, include game_mode in the body:
```ts
  const body = { name: payload.name, score: payload.score, correct: payload.correct, pool: payload.pool, game_mode: payload.gameMode, ...(payload.modeId ? { mode_id: payload.modeId } : {}) };
```

- [ ] **Step 3: Pass gameMode into the game-over board**

In `src/ui/GameOver.tsx`, add a selector `const gameMode = useGameStore((s) => s.gameMode);` and pass it to `<GameOverLeaderboard … gameMode={gameMode} />`.

In `src/ui/GameOverLeaderboard.tsx`:
- Add `gameMode` to the prop type: `gameMode: RevealMode;` and import `RevealMode`.
- In the effect, filter the non-custom board by it: `const rankP = modeId ? fetchModeProjectedRank(modeId, score) : fetchProjectedRank(pool, score, gameMode);` and `const topP = modeId ? fetchModeTopScores(modeId, VISIBLE) : fetchTopScores(pool, VISIBLE, null, gameMode);` (add `gameMode` to the effect deps).
- In `post()`, send it: `submitScore({ name: clean, score, correct, pool, modeId, gameMode })`, and the refresh `fetchTopScores(pool, VISIBLE, null, gameMode)`.
- Add `gameMode` to the `youEntry` literal: `gameMode,`.

- [ ] **Step 4: Verify build + tests**

Run: `npm run build && npm test`
Expected: PASS (existing leaderboard tests still green; `gameMode` is optional on fetches, required on submit/entry and supplied everywhere it's constructed).

- [ ] **Step 5: Commit**

```bash
git add src/leaderboard/types.ts src/leaderboard/client.ts src/ui/GameOverLeaderboard.tsx src/ui/GameOver.tsx
git commit -m "feat: per-mode leaderboard reads + submit; game-over board filtered by game_mode"
```

---

### Task 7: Mode badge + click-to-replay on leaderboard rows

**Files:**
- Modify: `src/ui/GlobalScoreList.tsx`
- Test: `src/ui/GlobalScoreList.test.tsx` (create if absent)

- [ ] **Step 1: Write the failing test**

Create `src/ui/GlobalScoreList.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GlobalScoreList } from './GlobalScoreList';
import { useGameStore } from '../state/gameStore';
import type { GlobalEntry } from '../leaderboard/types';

const entry: GlobalEntry = {
  id: '1', name: 'Al', score: 900, correct: 9, pool: 'all', gameMode: 'zoom', country: 'DE', createdAt: 0,
};

beforeEach(() => {
  useGameStore.setState({ pendingRevealChoice: 'random' });
  vi.restoreAllMocks();
});

describe('GlobalScoreList', () => {
  it('shows a mode badge and replays that mode on click', () => {
    const onPlay = vi.fn();
    render(<GlobalScoreList entries={[entry]} onPlayMode={onPlay} />);
    expect(screen.getByText(/zoom/i)).toBeTruthy();
    fireEvent.click(screen.getByTestId('global-entry'));
    expect(onPlay).toHaveBeenCalledWith('zoom');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/ui/GlobalScoreList.test.tsx`
Expected: FAIL — no `onPlayMode` / no badge.

- [ ] **Step 3: Add badge + click**

In `src/ui/GlobalScoreList.tsx`:
- Import the labels: `import { REVEAL_MODE_LABELS } from '../reveal/labels';`.
- Change `GRID` to make room for the badge: `const GRID = '32px 20px 1fr auto auto auto';`.
- Give `Row` an optional `onPlay?: () => void` prop; when set, make the row a clickable element (`role="button"`, `cursor: 'pointer'`, `onClick={onPlay}`) and add a badge cell before the score:
```tsx
      <span style={{ color: 'var(--ink-2)', fontSize: 10, fontFamily: "'JetBrains Mono', monospace", padding: '2px 6px', borderRadius: 6, border: '1px solid var(--line)' }}>
        {entry.gameMode ? REVEAL_MODE_LABELS[entry.gameMode] : '—'}
      </span>
```
- Give `GlobalScoreList` an optional prop `onPlayMode?: (mode: RevealMode) => void;` (import `RevealMode`). For each rendered `Row`, pass `onPlay={onPlayMode && entry.gameMode ? () => onPlayMode(entry.gameMode!) : undefined}`.

- [ ] **Step 4: Run the test**

Run: `npm test -- src/ui/GlobalScoreList.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire the start leaderboard to launch a game**

In `src/ui/StartLeaderboard.tsx` (the wrapper around `GlobalScoreList`/`Leaderboard`), pass an `onPlayMode` that starts a game in that mode on the currently viewed pool: it should call `useGameStore.getState().setRevealChoice(mode)` then `selectPool({ kind, excludeUniverseBeyond: true })` where `kind` is the active pool tab (`'all'` or `'popular'`; default `'popular'`). Thread `onPlayMode` from `StartLeaderboard` → `Leaderboard` → `GlobalScoreList`. (Read `Leaderboard.tsx` to find where it renders `GlobalScoreList` and which pool tab is active.)

- [ ] **Step 6: Verify build + tests**

Run: `npm run build && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/GlobalScoreList.tsx src/ui/GlobalScoreList.test.tsx src/ui/StartLeaderboard.tsx src/ui/Leaderboard.tsx
git commit -m "feat: mode badge + click-to-replay on leaderboard rows"
```

---

### Task 8: Browser verification + memory

**Files:** none (verification) + memory.

- [ ] **Step 1: Build**

Run: `npm run build` — expected PASS.

- [ ] **Step 2: Eyeball in a real browser**

`npm run dev`, open the local URL in a normal browser tab. Verify: the start screen shows the reveal-mode picker (Random + enabled modes); picking a mode then Popular/All plays the WHOLE game in that one mode; Random plays one consistent mode; the timer is ~30s; on game over the board shows the per-mode ranking and posting works; a leaderboard row shows a mode badge and clicking it starts a new game in that mode.

- [ ] **Step 3: Verify per-mode scoring end to end**

Play a short game in (say) scanner, post a score, and confirm via the Management API that the row has `game_mode='scanner'`:
`select name, score, game_mode from leaderboard order by created_at desc limit 3;`

- [ ] **Step 4: Update architecture memory**

Update `/home/pete/.claude/projects/-home-pete-Schreibtisch-GuessTheCard/memory/project_current_architecture.md`: the game is now 30s; the reveal mode is chosen pre-game (`pendingRevealChoice` → resolved `gameMode`, no rotation; `resolveGameMode`; `revealModeFor`/`revealOffset` removed); the start screen has `RevealModePicker`; leaderboard has a `game_mode` column (migration `0005`), submit-score validates+ranks per mode, the game-over board filters by `gameMode`, and rows show a mode badge + click-to-replay (reveal mode only, current pool). Note this shipped on a worktree branch pending merge.
