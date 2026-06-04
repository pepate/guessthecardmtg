# Summed-per-reveal leaderboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rank a pool's leaderboard by the sum of each player's best score per reveal mode, surface the player's own per-reveal bests + standing, add a game-over "Next mode" jump, and make the Daily Set summed + unlimited.

**Architecture:** New pure aggregation in `boards.ts` consumed from the already-loaded `fetchModeRuns(modeId)` (≤500 rows). `usePendingRun` computes the projected pool total/rank and the next 0-point reveal. `ModeDetail`, `GameResultModal`, `App`, the Daily UI, and the `submit-score` edge function are updated. No new RPC/migration.

**Tech Stack:** React + TypeScript + Vite, Vitest + Testing Library, Supabase JS, Deno edge function.

Spec: `docs/superpowers/specs/2026-06-04-summed-reveal-leaderboard-design.md`

## File structure

- `src/leaderboard/boards.ts` — add `summedBoard`, `ownBestPerReveal`, `summedRank`, `projectedSummedRank`, `nextZeroReveal` (pure). (+ `boards.test.ts`)
- `src/leaderboard/usePendingRun.ts` — summed projection + `nextMode`; recompute posted from fresh runs. (+ `usePendingRun.test.tsx`)
- `src/ui/GameResultModal.tsx` — single-run score + pool total + total rank + "Next mode". (+ `GameResultModal.test.tsx`)
- `src/ui/ModeDetail.tsx` — summed leaderboard tab, "your standing" row, own-best reveal list sorted by own score, daily simplification.
- `src/daily/client.ts`, `src/ui/DailySetModal.tsx`, `supabase/functions/submit-score/index.ts`, `src/App.tsx` — remove the 3/day cap; wire `onNextMode` + total/rank.

---

### Task 1: Pure summed-aggregation helpers

**Files:**
- Modify: `src/leaderboard/boards.ts`
- Test: `src/leaderboard/boards.test.ts`

- [ ] **Step 1: Write the failing tests** — append to `src/leaderboard/boards.test.ts`:

```typescript
import { summedBoard, ownBestPerReveal, summedRank, projectedSummedRank, nextZeroReveal } from './boards';
import type { Run } from './boards';

const r = (over: Partial<Run>): Run => ({
  id: 'i', name: 'N', score: 0, correct: 0, gameMode: 'blur', deviceId: 'd', country: null, createdAt: 0, ...over,
});

describe('summedBoard', () => {
  it('sums each device\'s best score per reveal and ranks by total', () => {
    const runs: Run[] = [
      r({ deviceId: 'a', name: 'Al', gameMode: 'blur', score: 100, createdAt: 1 }),
      r({ deviceId: 'a', name: 'Al', gameMode: 'blur', score: 150, createdAt: 2 }), // best blur = 150
      r({ deviceId: 'a', name: 'Al', gameMode: 'zoom', score: 80, createdAt: 3 }),  // total a = 230
      r({ deviceId: 'b', name: 'Bo', gameMode: 'blur', score: 200, createdAt: 4 }), // total b = 200
    ];
    const board = summedBoard(runs);
    expect(board.map((e) => [e.deviceId, e.score])).toEqual([['a', 230], ['b', 200]]);
  });

  it('ignores runs without a reveal mode and breaks ties by earliest run', () => {
    const runs: Run[] = [
      r({ deviceId: 'a', gameMode: 'blur', score: 100, createdAt: 5 }),
      r({ deviceId: 'b', gameMode: 'blur', score: 100, createdAt: 2 }),
      r({ deviceId: 'c', gameMode: null, score: 999, createdAt: 1 }),
    ];
    const board = summedBoard(runs);
    expect(board.map((e) => e.deviceId)).toEqual(['b', 'a']); // equal totals → earliest first
  });
});

describe('ownBestPerReveal', () => {
  it('returns the device\'s best per reveal', () => {
    const runs: Run[] = [
      r({ deviceId: 'a', gameMode: 'blur', score: 100 }),
      r({ deviceId: 'a', gameMode: 'blur', score: 140 }),
      r({ deviceId: 'a', gameMode: 'zoom', score: 70 }),
      r({ deviceId: 'b', gameMode: 'blur', score: 999 }),
    ];
    const m = ownBestPerReveal(runs, 'a');
    expect(m.get('blur')).toBe(140);
    expect(m.get('zoom')).toBe(70);
    expect(m.has('mosaic')).toBe(false);
  });
});

describe('summedRank', () => {
  it('is the 1-based index of the device, or null', () => {
    const runs: Run[] = [
      r({ deviceId: 'a', gameMode: 'blur', score: 300 }),
      r({ deviceId: 'b', gameMode: 'blur', score: 200 }),
    ];
    const board = summedBoard(runs);
    expect(summedRank(board, 'b')).toBe(2);
    expect(summedRank(board, 'zzz')).toBeNull();
  });
});

describe('projectedSummedRank', () => {
  const runs: Run[] = [
    r({ deviceId: 'a', gameMode: 'blur', score: 300 }),
    r({ deviceId: 'me', gameMode: 'blur', score: 100 }),
  ];
  it('adds a new reveal\'s score to the device total and ranks vs others', () => {
    // me had 100 (blur); adding zoom 250 → total 350 > a's 300 → rank 1
    expect(projectedSummedRank(runs, 'me', 'zoom', 250)).toEqual({ total: 350, rank: 1 });
  });
  it('replaces a reveal\'s best only when the new score is higher', () => {
    // me's blur best is 100; a new blur 50 does not lower it → total stays 100 → rank 2
    expect(projectedSummedRank(runs, 'me', 'blur', 50)).toEqual({ total: 100, rank: 2 });
  });
});

describe('nextZeroReveal', () => {
  it('returns the first enabled reveal with zero own points', () => {
    const own = new Map<import('../engine/timeAttack').RevealMode, number>([['blur', 120], ['zoom', 0]]);
    expect(nextZeroReveal(own, ['blur', 'zoom', 'mosaic'])).toBe('zoom');
  });
  it('returns null when every enabled reveal has points', () => {
    const own = new Map<import('../engine/timeAttack').RevealMode, number>([['blur', 1], ['zoom', 1]]);
    expect(nextZeroReveal(own, ['blur', 'zoom'])).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/leaderboard/boards.test.ts`
Expected: FAIL (functions not exported).

- [ ] **Step 3: Implement** — append to `src/leaderboard/boards.ts`:

```typescript
/** Per-device total = sum of best score per reveal mode. One entry per device,
 *  ranked by total desc, ties by earliest run, then deviceId for determinism.
 *  Runs without a reveal mode are ignored. */
export function summedBoard(runs: Run[]): GlobalEntry[] {
  const byDevice = new Map<string, Run[]>();
  for (const run of runs) {
    if (!run.gameMode) continue;
    const g = byDevice.get(run.deviceId);
    if (g) g.push(run);
    else byDevice.set(run.deviceId, [run]);
  }
  const entries: GlobalEntry[] = [];
  for (const [deviceId, group] of byDevice) {
    const bestPerReveal = new Map<RevealMode, Run>();
    for (const run of group) {
      const reveal = run.gameMode as RevealMode;
      const prev = bestPerReveal.get(reveal);
      if (!prev || run.score > prev.score) bestPerReveal.set(reveal, run);
    }
    const total = [...bestPerReveal.values()].reduce((sum, run) => sum + run.score, 0);
    const best = group.reduce((a, b) => (b.score > a.score ? b : a));
    const earliest = group.reduce((a, b) => (b.createdAt < a.createdAt ? b : a));
    const gameModes = [...bestPerReveal.entries()].sort((a, b) => b[1].score - a[1].score).map(([m]) => m);
    entries.push({
      id: best.id, name: best.name, score: total, correct: best.correct,
      gameModes, country: best.country, createdAt: earliest.createdAt, deviceId,
    });
  }
  entries.sort((a, b) => b.score - a.score || a.createdAt - b.createdAt || (a.deviceId < b.deviceId ? -1 : 1));
  return entries;
}

/** A device's best score per reveal mode (reveal absent ⇒ not in the map). */
export function ownBestPerReveal(runs: Run[], deviceId: string): Map<RevealMode, number> {
  const m = new Map<RevealMode, number>();
  for (const run of runs) {
    if (!run.gameMode || run.deviceId !== deviceId) continue;
    const prev = m.get(run.gameMode);
    if (prev === undefined || run.score > prev) m.set(run.gameMode, run.score);
  }
  return m;
}

/** 1-based rank of a device in a summed board, or null when absent. */
export function summedRank(board: GlobalEntry[], deviceId: string): number | null {
  const i = board.findIndex((e) => e.deviceId === deviceId);
  return i === -1 ? null : i + 1;
}

/** Projected pool total + rank if `newScore` were applied to `reveal` for `deviceId`. */
export function projectedSummedRank(
  runs: Run[],
  deviceId: string,
  reveal: RevealMode,
  newScore: number,
): { total: number; rank: number } {
  const own = ownBestPerReveal(runs, deviceId);
  own.set(reveal, Math.max(own.get(reveal) ?? 0, newScore));
  const total = [...own.values()].reduce((sum, v) => sum + v, 0);
  const others = summedBoard(runs.filter((r) => r.deviceId !== deviceId));
  const higher = others.filter((e) => e.score > total).length;
  return { total, rank: higher + 1 };
}

/** First enabled reveal the device has zero points in (enabled order), or null. */
export function nextZeroReveal(own: Map<RevealMode, number>, enabled: RevealMode[]): RevealMode | null {
  for (const reveal of enabled) {
    if ((own.get(reveal) ?? 0) === 0) return reveal;
  }
  return null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/leaderboard/boards.test.ts`
Expected: PASS (all new + existing board tests).

- [ ] **Step 5: Commit**

```bash
git add src/leaderboard/boards.ts src/leaderboard/boards.test.ts
git commit -m "feat(leaderboard): summed-per-reveal aggregation helpers"
```

---

### Task 2: usePendingRun — summed projection + nextMode

**Files:**
- Modify: `src/leaderboard/usePendingRun.ts`
- Test: `src/leaderboard/usePendingRun.test.tsx`

**Context:** `usePendingRun` currently calls `fetchModeProjectedRank(modeId, score)` (single best). Replace with the summed projection from `fetchModeRuns(modeId)`, and expose `nextMode` (the next 0-point reveal in the pool).

- [ ] **Step 1: Update imports** in `src/leaderboard/usePendingRun.ts`:

Replace line 5:
```typescript
import { isLeaderboardEnabled, fetchModeProjectedRank, submitScore } from './client';
```
with:
```typescript
import { isLeaderboardEnabled, fetchModeRuns, submitScore } from './client';
import { ownBestPerReveal, projectedSummedRank, nextZeroReveal } from './boards';
import { fetchEnabledRevealModes } from '../reveal/client';
```

- [ ] **Step 2: Add `nextMode` to the state type** — in `PendingRunState` (after `needsLogin: boolean;`):

```typescript
  /** The next enabled reveal in this pool the device has 0 points in, or null. */
  nextMode: RevealMode | null;
```

- [ ] **Step 3: Add `nextMode` state** — after the `needsLogin` useState (line ~41):

```typescript
  const [nextMode, setNextMode] = useState<RevealMode | null>(null);
```

- [ ] **Step 4: Replace the projection effect body** — replace the `useEffect` block at lines ~80-102 with:

```typescript
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      const uid = await getUserId().catch(() => null);
      if (cancelled) return;
      if (modeId) {
        const [runs, enabled] = await Promise.all([
          fetchModeRuns(modeId).catch(() => []),
          fetchEnabledRevealModes().catch(() => [] as RevealMode[]),
        ]);
        if (cancelled) return;
        setProjected(projectedSummedRank(runs, uid ?? '', run!.gameMode, run!.score));
        const own = ownBestPerReveal(runs, uid ?? '');
        setNextMode(nextZeroReveal(own, enabled.filter((m) => m !== run!.gameMode)));
      } else {
        setProjected({ rank: 1, total: run!.score });
        setNextMode(null);
      }
      const profile = uid ? await getProfile(uid).catch(() => null) : null;
      if (cancelled) return;
      const known = sanitizeName(profile?.displayName ?? localStorage.getItem(NAME_KEY) ?? '');
      if (!known) { setNeedsLogin(true); return; }
      await doPost(known);
    })().catch(() => {});
    return () => { cancelled = true; };
    // modeFilter intentionally omitted — only read inside doPost when posting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, modeId, run?.score]);
```

Note: `nextZeroReveal` is passed the enabled reveals *excluding the one just played* so "Next mode" always points to a different mode.

- [ ] **Step 5: Recompute posted from fresh runs** — in `doPost`, replace the success block (lines ~70-77, from `localStorage.setItem` through `return true;`) with:

```typescript
    localStorage.setItem(NAME_KEY, clean);
    // Recompute the pool total/rank from fresh runs (now including this row), so
    // the headline reflects the summed standing, not the edge function's single-best rank.
    const fresh = await fetchModeRuns(resolvedModeId).catch(() => []);
    const uid = await getUserId().catch(() => null);
    const proj = projectedSummedRank(fresh, uid ?? '', run.gameMode, run.score);
    if (mountedRef.current) {
      setName(clean);
      setNeedsLogin(false);
      setProjected(proj);
      setPosted({ rank: proj.rank, id: res.id });
      setStatus('done');
    }
    return true;
```

- [ ] **Step 6: Expose `nextMode`** — in the returned object (after `needsLogin,`):

```typescript
    nextMode,
```

- [ ] **Step 7: Update the test** — `src/leaderboard/usePendingRun.test.tsx` mocks `./client`. Ensure it mocks `fetchModeRuns` (returning `[]`) instead of `fetchModeProjectedRank`, and `../reveal/client` `fetchEnabledRevealModes` (returning `[]`). Read the current mock block and adjust:

```typescript
vi.mock('./client', () => ({
  isLeaderboardEnabled: () => true,
  fetchModeRuns: vi.fn().mockResolvedValue([]),
  submitScore: vi.fn().mockResolvedValue({ ok: true, id: 'x', rank: 1 }),
}));
vi.mock('../reveal/client', () => ({ fetchEnabledRevealModes: vi.fn().mockResolvedValue([]) }));
```

Keep the existing identity/profile/modes mocks. The existing assertions about posting/needsLogin still hold (projected falls back to `{rank:1,total:score}` shape via empty runs).

- [ ] **Step 8: Run tests + typecheck**

Run: `npx vitest run src/leaderboard/usePendingRun.test.tsx && npx tsc -p tsconfig.app.json --noEmit`
Expected: PASS, clean. (If the existing test asserted `fetchModeProjectedRank`, update that assertion to the new behaviour.)

- [ ] **Step 9: Commit**

```bash
git add src/leaderboard/usePendingRun.ts src/leaderboard/usePendingRun.test.tsx
git commit -m "feat(leaderboard): pending run projects pool total/rank + next mode"
```

---

### Task 3: GameResultModal — total, total rank, Next mode

**Files:**
- Modify: `src/ui/GameResultModal.tsx`
- Test: `src/ui/GameResultModal.test.tsx`

- [ ] **Step 1: Write/extend failing tests** — replace `src/ui/GameResultModal.test.tsx` with:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GameResultModal } from './GameResultModal';

describe('GameResultModal', () => {
  it('shows the run score, pool total and total rank, and wires actions', () => {
    const onReplay = vi.fn(), onShare = vi.fn(), onClose = vi.fn();
    render(
      <GameResultModal
        score={2144} total={5300} totalRank={3} modeName="EDHRec 100"
        onReplay={onReplay} onShare={onShare} onClose={onClose}
      />,
    );
    expect(screen.getByTestId('result-total').textContent).toContain('5300');
    expect(screen.getByTestId('result-rank').textContent).toContain('#3');
    fireEvent.click(screen.getByTestId('result-replay'));
    fireEvent.click(screen.getByTestId('result-share'));
    fireEvent.click(screen.getByTestId('result-close'));
    expect(onReplay).toHaveBeenCalledOnce();
    expect(onShare).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows Next mode only when a next mode is available', () => {
    const onNextMode = vi.fn();
    const { rerender } = render(
      <GameResultModal score={0} total={0} totalRank={null} onReplay={() => {}} onShare={() => {}} onClose={() => {}} />,
    );
    expect(screen.queryByTestId('result-next-mode')).toBeNull();
    rerender(
      <GameResultModal score={0} total={0} totalRank={null} hasNextMode onNextMode={onNextMode}
        onReplay={() => {}} onShare={() => {}} onClose={() => {}} />,
    );
    fireEvent.click(screen.getByTestId('result-next-mode'));
    expect(onNextMode).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ui/GameResultModal.test.tsx`
Expected: FAIL (props/testids missing).

- [ ] **Step 3: Implement** — update `GameResultModal`:

Change the prop type block (lines 7-26) to add `total`, `totalRank`, `hasNextMode`, `onNextMode` (and keep `rank` removed — replaced by `totalRank`):

```tsx
export function GameResultModal({
  score,
  total,
  totalRank,
  modeName,
  needsSave = false,
  hasNextMode = false,
  onSaveRank,
  onNextMode,
  onReplay,
  onShare,
  onClose,
}: {
  score: number;
  total: number;
  totalRank: number | null;
  modeName?: string;
  needsSave?: boolean;
  hasNextMode?: boolean;
  onSaveRank?: () => void;
  onNextMode?: () => void;
  onReplay: () => void;
  onShare: () => void;
  onClose: () => void;
}) {
```

Replace the rank line (lines 63-67) with a total + rank block:

```tsx
        <div data-testid="result-total" style={{ color: 'var(--ink-1)', fontFamily: "'JetBrains Mono', monospace", fontSize: 14, textAlign: 'center' }}>
          Total <ScoreValue score={total} fontSize={16} /> pts
          {totalRank != null && (
            <> · <span data-testid="result-rank" style={{ color: 'var(--ember-hot)', fontWeight: 700 }}>#{totalRank}</span></>
          )}
        </div>
```

In the `showSave` hint (lines 69-74), replace `rank` references with `totalRank`.

Add the Next-mode button as the FIRST button in the action column (inside the `<div style={{ display: 'flex', flexDirection: 'column', gap: 8, ... }}>`, before the Replay button):

```tsx
          {hasNextMode && onNextMode && (
            <button type="button" data-testid="result-next-mode" onClick={onNextMode} className="ember-btn" style={btn}>
              Next mode
            </button>
          )}
```

When `hasNextMode`, Replay should not also be the ember primary — set Replay to `outlineBtn` when `hasNextMode || showSave`. Update the Replay button's `className`/`style`:

```tsx
            className={showSave || hasNextMode ? undefined : 'ember-btn'}
            style={showSave || hasNextMode ? outlineBtn : btn}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/ui/GameResultModal.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/GameResultModal.tsx src/ui/GameResultModal.test.tsx
git commit -m "feat(ui): game-over shows pool total/rank + Next mode"
```

---

### Task 4: App — wire total/rank/Next mode; switch result modal

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add a next-mode handler** — after `replayGame()` (line ~364) add:

```tsx
  function nextMode() {
    if (!currentModeId || !pending.nextMode) return;
    setResultOpen(false);
    const s = useGameStore.getState();
    s.setRevealChoice(pending.nextMode);
    void s.selectPool({ kind: 'custom', modeId: currentModeId, filter: currentModeFilter ?? {}, name: currentModeName ?? '' });
  }
```

- [ ] **Step 2: Update the GameResultModal usage** — replace its props (lines ~618-626) so it passes the run score, pool total, total rank, and the next-mode affordance (hidden for Daily). Current call passes `rank={pending.postedRank ?? pending.projectedRank}`; change to:

```tsx
        <GameResultModal
          score={totalScore}
          total={pending.projectedTotal ?? totalScore}
          totalRank={pending.postedRank ?? pending.projectedRank}
          modeName={currentModeName ?? undefined}
          needsSave={pending.needsLogin}
          hasNextMode={!dailyReveal && pending.nextMode != null}
          onNextMode={nextMode}
          onSaveRank={() => { setResultOpen(false); setGameOverProfileOpen(true); }}
          onReplay={replayGame}
          onShare={() => void shareStats()}
          onClose={() => setResultOpen(false)}
        />
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: clean (other App regions — daily — handled in Task 6).

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(ui): wire pool total/rank + Next mode into the game-over modal"
```

---

### Task 5: ModeDetail — summed leaderboard, your standing, own-best reveal list

**Files:**
- Modify: `src/ui/ModeDetail.tsx`

**Context:** Read the current file. It loads `fetchRevealLeaders` + `fetchModeRuns`, renders a unified run list for both tabs, and a reveal list keyed off global leaders. Change: drop leaders, add `deviceId`, render the LEADERBOARD tab from `summedBoard`, add a standing row, and show own-best per reveal sorted by own score.

- [ ] **Step 1: Imports + state.** Replace the `fetchRevealLeaders, fetchModeRuns` import with `fetchModeRuns`; add `import { summedBoard, ownBestPerReveal, summedRank, type Run } from '../leaderboard/boards';` (Run is already imported — keep one import), and `import { getUserId } from '../leaderboard/identity';`. Add state: `const [deviceId, setDeviceId] = useState('');`. Remove the `leaders` state.

- [ ] **Step 2: Update `load()`** to drop leaders and capture the device id:

```tsx
  const load = useCallback(async () => {
    try {
      const en = await fetchEnabledRevealModes();
      setEnabled(en);
      const uid = await getUserId().catch(() => null);
      setDeviceId(uid ?? '');
      if (!modeId) { setRuns([]); return; }
      setRuns(await fetchModeRuns(modeId));
    } catch {
      setEnabled([]);
    }
  }, [modeId]);
```

- [ ] **Step 3: Derived values.** Replace the `byScore` definition (line ~114) usage so the LEADERBOARD list is the summed board while RECENT stays runs. After `const played = runs.filter((r) => r.gameMode);` add:

```tsx
  const board = summedBoard(runs);
  const myRank = summedRank(board, deviceId);
  const myTotal = board.find((e) => e.deviceId === deviceId)?.score ?? 0;
  const own = ownBestPerReveal(runs, deviceId);
  const revealsSorted = [...(enabled ?? [])].sort(
    (a, b) => (own.get(b) ?? 0) - (own.get(a) ?? 0) || REVEAL_MODE_LABELS[a].localeCompare(REVEAL_MODE_LABELS[b]),
  );
```

- [ ] **Step 4: LEADERBOARD list rows.** The RECENT tab keeps the existing run rows. For the LEADERBOARD tab, render `board` entries (rank + flag + name + total, NO reveal label), inserting the pending row at its projected rank. Replace the list-building (`leaderboardList`/`activeList`) so:
  - `recentList` = the existing run-based list (unchanged).
  - `leaderboardEntries` = `board` with the pending entry inserted at `pendingRow.rank - 1` (pending entry: `{ id: PENDING_ID, name: pendingRow.name ?? '', score: pendingRow.score, deviceId: PENDING_ID, country: null, createdAt: now, correct: pendingRow.correct, gameModes: [] }`).
  - Render two distinct row templates: leaderboard rows show `#rank · flag · name · ScoreValue(total)` (no `REVEAL_MODE_LABELS`, no age); recent rows unchanged.

  Concretely, in the list `.map`, branch on `tab`: when `tab === 'leaderboard'` render the entry-row (use `entry.score` as the total, omit the reveal/age span); when `tab === 'recent'` keep the current run row. Keep `shown`/`hasMore`/`More` paging against the active list.

- [ ] **Step 5: "Your standing" row.** Immediately before the `<p>…Pick a reveal mode…</p>` (line ~291) insert:

```tsx
        <div data-testid="your-standing" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 10, border: '1px solid var(--line-strong)', background: 'rgba(20,17,28,0.6)', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--ink-1)' }}>
          <span>Your standing</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--ember-hot)', fontWeight: 700 }}>{myRank != null ? `#${myRank}` : '—'}</span>
            <ScoreValue score={myTotal} fontSize={13} />
          </span>
        </div>
```

- [ ] **Step 6: Reveal list = own best + reveal name, sorted.** Replace the `enabled.map((reveal) => { const leader = leaders?.[reveal]…})` with `revealsSorted.map((reveal) => { … })`, and replace the leader span with the reveal name + own best:

```tsx
                  <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--ink-1)', minWidth: 0 }}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{REVEAL_MODE_LABELS[reveal]}</span>
                    <ScoreValue score={own.get(reveal) ?? 0} fontSize={13} />
                  </span>
```

Also simplify `rowDisabled` (drop the playsLeft term): `const rowDisabled = lockedReveal != null && reveal !== lockedReveal;` and remove the `formatAge`/`countryToFlag` usage now unused in this block (keep imports only if still used by the recent rows — `countryToFlag` and `formatAge` are still used by recent run rows, so keep them).

- [ ] **Step 7: Daily "Play again".** Change the daily replay button condition (line ~359) to drop `playsLeft`:

```tsx
        {lockedReveal != null && onPlayAgain && (
          <button type="button" className="ember-btn" data-testid="daily-play-again" onClick={onPlayAgain} style={{ width: '100%', padding: '13px 0', fontSize: 16, marginTop: 4 }}>
            Play again
          </button>
        )}
```

- [ ] **Step 8: Run tests + typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit && npx vitest run src/ui/ModeDetail.test.tsx`
Expected: clean; update `ModeDetail.test.tsx` if it asserted the old leader rows or `playsLeft`. The reveal rows still expose `data-testid="reveal-row"`/`reveal-play`; the leaderboard rows keep `data-testid="game-row"`.

- [ ] **Step 9: Commit**

```bash
git add src/ui/ModeDetail.tsx src/ui/ModeDetail.test.tsx
git commit -m "feat(ui): summed leaderboard + own-best reveal list in mode detail"
```

---

### Task 6: Remove the Daily 3-play cap

**Files:**
- Modify: `supabase/functions/submit-score/index.ts`, `src/daily/client.ts`, `src/ui/DailySetModal.tsx`, `src/App.tsx`, `src/ui/ModeDetail.tsx` (props)

- [ ] **Step 1: Edge function.** In `supabase/functions/submit-score/index.ts`, delete the entire Daily Set cap block (the `berlinDay`/`todayDaily`/`played`/`daily-limit` section between the rate-limit check and `const country = …`). Keep the 5/60s rate limit.

- [ ] **Step 2: `daily/client.ts`.** Remove `playsUsed` from `DailyToday` and stop computing it in `compose` (delete the `playsUsed` block and the `getUserId`/count query lines; return without `playsUsed`).

- [ ] **Step 3: `DailySetModal.tsx`.** Remove `DAILY_MAX`, `playsLeft`, the "plays left today" line (`daily-plays-left`), and the disabled/opacity logic — Play is always enabled with label `Play`.

- [ ] **Step 4: `App.tsx`.** Delete `dailyPlaysLeft` state + its `useEffect` (lines ~341-349). In the `<ModeDetail>` usage (lines ~566-575) remove the `playsLeft` prop; pass `onPlayAgain={dailyReveal ? replayDaily : undefined}` unchanged.

- [ ] **Step 5: `ModeDetail.tsx` props.** Remove `playsLeft` from `ModeDetailProps` and the destructure (it's no longer read after Task 5 Step 7).

- [ ] **Step 6: Typecheck + tests**

Run: `npx tsc -p tsconfig.app.json --noEmit && npx vitest run`
Expected: clean; fix any test referencing `playsUsed`/`playsLeft`/`daily-plays-left` (e.g. DailySetModal.test, DailySetButton — note `DailySetButton` reads `daily` but not `playsUsed`; the `DailyToday` literal in tests must drop `playsUsed`).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(daily): summed scoring + unlimited plays (remove 3/day cap)"
```

- [ ] **Step 8: Redeploy the edge function** (out-of-band, needs Supabase access token):

```bash
SUPABASE_ACCESS_TOKEN=<token> npx supabase functions deploy submit-score --project-ref jgapiqpaeaslfpbgiptf
```

---

### Task 7: Full verification

- [ ] **Step 1:** `npx tsc -p tsconfig.app.json --noEmit` → clean.
- [ ] **Step 2:** `npx vitest run` → all green.
- [ ] **Step 3:** `npm run build` → built.
- [ ] **Step 4:** Commit any fixups:

```bash
git add -A && git commit -m "fix: resolve fallout for summed leaderboard"
```

---

## Self-review notes

- **Spec coverage:** summed total ranking (Task 1 `summedBoard`); leaderboard tab summed, no reveal tag (Task 5 Step 4); your-standing row (Task 5 Step 5); own-best reveal list sorted by own score with reveal-name labels (Task 5 Steps 3,6); in-game projected total/rank (Task 2); game-over single+total+rank + Next mode (Tasks 3,4); Daily summed + unlimited + cap removal (Task 6); daily redeploy (Task 6 Step 8). All covered.
- **Type consistency:** `Run`, `GlobalEntry`, `RevealMode` reused from existing modules. `usePendingRun` exposes `projectedTotal`/`projectedRank`/`nextMode`; App passes `total`/`totalRank`/`hasNextMode`/`onNextMode` matching the new `GameResultModal` props. `fetchModeProjectedRank` is no longer used by `usePendingRun` (left exported; harmless).
- **No new RPC/migration.** Edge function change is a deletion + redeploy.
