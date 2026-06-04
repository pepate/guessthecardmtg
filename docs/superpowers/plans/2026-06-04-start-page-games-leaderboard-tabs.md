# Start page Games/Leaderboard tabs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the start page into an always-visible Daily Set plus two tabs — **Games** (4 recently-played game cards, default) and **Leaderboard** (today's ranked mode list) — where tapping a game card opens the existing `ModeDetail`.

**Architecture:** A new pure+fetch module resolves the device's recently-played games from the public `leaderboard_top` view. A new `RecentGames` component renders the cards. `StartModes` gains a tab switch and renders either `RecentGames` or its existing pills+list. Clicking a card reuses the existing `onPick` → `ModeDetail` path.

**Tech Stack:** React + TypeScript, Zustand (unused here), Supabase JS, Vitest + Testing Library, framer-motion.

Spec: `docs/superpowers/specs/2026-06-04-start-page-games-leaderboard-tabs-design.md`

## File structure

- Create `src/modes/recent.ts` — recently-played resolver: pure helpers `recentDistinctIds`, `fillToLimit`, and `fetchRecentGames`.
- Create `src/modes/recent.test.ts` — unit tests for the resolver.
- Create `src/ui/RecentGames.tsx` — the Games-tab card grid.
- Create `src/ui/RecentGames.test.tsx` — component tests.
- Modify `src/ui/StartModes.tsx` — Daily Set (always) + tab switch + conditional content.

---

### Task 1: Pure recent-games helpers

**Files:**
- Create: `src/modes/recent.ts`
- Test: `src/modes/recent.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/modes/recent.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { recentDistinctIds, fillToLimit } from './recent';
import type { CustomMode } from './types';

const mode = (id: string): CustomMode => ({ id, name: id, filter: {}, card_count: 10 });

describe('recentDistinctIds', () => {
  it('keeps the first occurrence of each mode_id, newest first, capped at limit', () => {
    const rows = [
      { mode_id: 'a' }, { mode_id: 'b' }, { mode_id: 'a' }, { mode_id: 'c' }, { mode_id: 'd' }, { mode_id: 'e' },
    ];
    expect(recentDistinctIds(rows, 4)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('returns fewer than limit when there are fewer distinct ids', () => {
    expect(recentDistinctIds([{ mode_id: 'a' }, { mode_id: 'a' }], 4)).toEqual(['a']);
  });
});

describe('fillToLimit', () => {
  it('appends extras not already present, up to the limit', () => {
    const out = fillToLimit([mode('a'), mode('b')], [mode('b'), mode('c'), mode('d'), mode('e')], 4);
    expect(out.map((m) => m.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('never exceeds the limit even if primary already has enough', () => {
    const out = fillToLimit([mode('a'), mode('b'), mode('c'), mode('d')], [mode('e')], 4);
    expect(out.map((m) => m.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modes/recent.test.ts`
Expected: FAIL — `recent.ts` does not exist / exports missing.

- [ ] **Step 3: Write minimal implementation**

Create `src/modes/recent.ts`:

```typescript
import { getSupabase } from '../supabase/client';
import { getUserId } from '../leaderboard/identity';
import { getModeById } from './client';
import type { CustomMode } from './types';

// Upper bound on device rows pulled before de-duplicating to distinct modes.
const RECENT_FETCH_CAP = 80;

/** Distinct mode_ids in row order (newest first), capped at `limit`. */
export function recentDistinctIds(rows: { mode_id: string }[], limit: number): string[] {
  const ids: string[] = [];
  for (const r of rows) {
    if (!ids.includes(r.mode_id)) ids.push(r.mode_id);
    if (ids.length >= limit) break;
  }
  return ids;
}

/** `primary`, then `extra` entries not already present, capped at `limit`. */
export function fillToLimit(primary: CustomMode[], extra: CustomMode[], limit: number): CustomMode[] {
  const out = [...primary];
  for (const m of extra) {
    if (out.length >= limit) break;
    if (!out.some((x) => x.id === m.id)) out.push(m);
  }
  return out.slice(0, limit);
}

/** The current device's most-recently-played games (modes), newest first. */
export async function fetchRecentGames(limit = 4): Promise<CustomMode[]> {
  const c = getSupabase();
  if (!c) return [];
  const uid = await getUserId().catch(() => null);
  if (!uid) return [];
  const { data, error } = await c
    .from('leaderboard_top')
    .select('mode_id,created_at')
    .eq('device_id', uid)
    .order('created_at', { ascending: false })
    .limit(RECENT_FETCH_CAP);
  if (error || !data) return [];
  const ids = recentDistinctIds(data as { mode_id: string }[], limit);
  const modes = await Promise.all(ids.map((id) => getModeById(id).catch(() => null)));
  return modes.filter((m): m is CustomMode => m != null);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modes/recent.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modes/recent.ts src/modes/recent.test.ts
git commit -m "feat(modes): recent-games resolver helpers"
```

---

### Task 2: `fetchRecentGames` query behaviour

**Files:**
- Modify: `src/modes/recent.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/modes/recent.test.ts` (add `vi` to the vitest import: `import { describe, it, expect, vi, beforeEach } from 'vitest';`):

```typescript
const from = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from })),
}));
vi.mock('../leaderboard/identity', () => ({
  getUserId: vi.fn().mockResolvedValue('dev-1'),
}));
vi.mock('./client', () => ({
  getModeById: vi.fn((id: string) => Promise.resolve({ id, name: `Mode ${id}`, filter: {}, card_count: 5 })),
}));

function query(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit']) q[m] = vi.fn(() => q);
  (q as { then: unknown }).then = (f: (v: unknown) => unknown) => Promise.resolve(result).then(f);
  return q;
}

async function importRecent() {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  vi.resetModules();
  return import('./recent');
}

describe('fetchRecentGames', () => {
  beforeEach(() => { from.mockReset(); vi.unstubAllEnvs(); });

  it('resolves the device\'s distinct recent modes, newest first', async () => {
    from.mockReturnValueOnce(query({
      data: [
        { mode_id: 'm1', created_at: '2026-01-03T00:00:00Z' },
        { mode_id: 'm2', created_at: '2026-01-02T00:00:00Z' },
        { mode_id: 'm1', created_at: '2026-01-01T00:00:00Z' },
      ],
      error: null,
    }));
    const { fetchRecentGames } = await importRecent();
    const games = await fetchRecentGames(4);
    expect(games.map((m) => m.id)).toEqual(['m1', 'm2']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `npx vitest run src/modes/recent.test.ts`
Expected: PASS — the implementation from Task 1 already satisfies this. (If it fails, fix `fetchRecentGames`, not the test.)

- [ ] **Step 3: Commit**

```bash
git add src/modes/recent.test.ts
git commit -m "test(modes): fetchRecentGames distinct/newest behaviour"
```

---

### Task 3: RecentGames card grid component

**Files:**
- Create: `src/ui/RecentGames.tsx`
- Test: `src/ui/RecentGames.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/ui/RecentGames.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecentGames } from './RecentGames';
import type { CustomMode } from '../modes/types';

const mode = (id: string): CustomMode => ({ id, name: `Game ${id}`, filter: {}, card_count: 9 });

vi.mock('../modes/recent', async (orig) => ({
  ...(await orig<typeof import('../modes/recent')>()),
  fetchRecentGames: vi.fn(),
}));
vi.mock('../modes/client', () => ({ listModes: vi.fn().mockResolvedValue([]) }));
vi.mock('../cards/client', () => ({ fetchModeTopArt: vi.fn().mockResolvedValue(null) }));
vi.mock('../leaderboard/client', () => ({ fetchModeTopScores: vi.fn().mockResolvedValue([]) }));

import { fetchRecentGames } from '../modes/recent';
import { listModes } from '../modes/client';

const mockRecent = fetchRecentGames as ReturnType<typeof vi.fn>;
const mockList = listModes as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue([]);
});

describe('RecentGames', () => {
  it('renders a card per recent game and fires onPick on tap', async () => {
    mockRecent.mockResolvedValue([mode('a'), mode('b')]);
    const onPick = vi.fn();
    render(<RecentGames onPick={onPick} />);
    await waitFor(() => expect(screen.getAllByTestId('game-card')).toHaveLength(2));
    fireEvent.click(screen.getAllByTestId('game-card')[0]);
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('fills up to 4 cards with popular games when recents are few', async () => {
    mockRecent.mockResolvedValue([mode('a')]);
    mockList.mockResolvedValue([mode('a'), mode('x'), mode('y'), mode('z'), mode('w')]);
    render(<RecentGames onPick={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByTestId('game-card')).toHaveLength(4));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/RecentGames.test.tsx`
Expected: FAIL — `RecentGames` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/ui/RecentGames.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { CustomMode } from '../modes/types';
import { fetchRecentGames, fillToLimit } from '../modes/recent';
import { listModes } from '../modes/client';
import { fetchModeTopArt } from '../cards/client';
import { fetchModeTopScores } from '../leaderboard/client';
import type { GlobalEntry } from '../leaderboard/types';
import { ScoreValue } from './ScoreValue';
import { countryToFlag } from '../leaderboard/flag';

interface GameCard {
  mode: CustomMode;
  art: string | null;
  leader: GlobalEntry | null;
}

const FALLBACK_ART = `${import.meta.env.BASE_URL}og-image.jpeg`;

export function RecentGames({ onPick }: { onPick: (mode: CustomMode) => void }) {
  const [cards, setCards] = useState<GameCard[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const recent = await fetchRecentGames(4).catch(() => [] as CustomMode[]);
      let games = recent;
      if (games.length < 4) {
        const popular = await listModes(8).catch(() => []);
        games = fillToLimit(recent, popular, 4);
      }
      const built = await Promise.all(
        games.map(async (mode) => ({
          mode,
          art: await fetchModeTopArt(mode.filter).catch(() => null),
          leader: (await fetchModeTopScores(mode.id, 1).catch(() => []))[0] ?? null,
        })),
      );
      if (!cancelled) setCards(built);
    })().catch(() => { if (!cancelled) setCards([]); });
    return () => { cancelled = true; };
  }, []);

  if (cards === null) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
        <span className="spinner" />
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <p data-testid="games-empty" style={{ color: 'var(--ink-1)', fontSize: 14, textAlign: 'center', margin: 0 }}>
        No games yet — start one from the Leaderboard tab.
      </p>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      data-testid="recent-games"
      style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}
    >
      {cards.map(({ mode, art, leader }) => (
        <button
          key={mode.id}
          type="button"
          data-testid="game-card"
          onClick={() => onPick(mode)}
          style={{
            position: 'relative',
            aspectRatio: '4 / 3',
            borderRadius: 14,
            overflow: 'hidden',
            padding: 0,
            cursor: 'pointer',
            border: '1px solid var(--line-strong)',
            background: `center / cover no-repeat url(${art ?? FALLBACK_ART})`,
            textAlign: 'left',
          }}
        >
          <span
            aria-hidden
            style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(180deg, rgba(7,6,10,0.1) 0%, rgba(7,6,10,0.55) 60%, rgba(7,6,10,0.9) 100%)',
            }}
          />
          <span
            style={{
              position: 'absolute', left: 12, right: 12, bottom: 10,
              display: 'flex', flexDirection: 'column', gap: 4,
            }}
          >
            <span style={{ color: 'var(--ink-0)', fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, fontSize: 18, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textShadow: '0 1px 8px rgba(0,0,0,0.8)' }}>
              {mode.name}
            </span>
            {leader && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--ink-1)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, minWidth: 0 }}>
                <span aria-hidden>{countryToFlag(leader.country)}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{leader.name}</span>
                <ScoreValue score={leader.score} fontSize={12} />
              </span>
            )}
          </span>
        </button>
      ))}
    </motion.div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/RecentGames.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/RecentGames.tsx src/ui/RecentGames.test.tsx
git commit -m "feat(ui): RecentGames card grid for the Games tab"
```

---

### Task 4: StartModes tab switch (Games default + Leaderboard)

**Files:**
- Modify: `src/ui/StartModes.tsx`
- Test: `src/ui/StartModes.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `src/ui/StartModes.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StartModes } from './StartModes';

// Stub the heavy children so the test focuses on the tab switch.
vi.mock('./DailySet', () => ({ DailySet: () => <div data-testid="daily-set" /> }));
vi.mock('./RecentGames', () => ({ RecentGames: () => <div data-testid="recent-games" /> }));
vi.mock('../modes/client', () => ({ listModes: vi.fn().mockResolvedValue([]) }));
vi.mock('../leaderboard/client', () => ({ fetchModeRuns: vi.fn().mockResolvedValue([]) }));
vi.mock('../daily/client', () => ({ fetchDailyToday: vi.fn().mockResolvedValue(null) }));
vi.mock('../leaderboard/identity', () => ({ getUserId: vi.fn().mockResolvedValue('') }));
vi.mock('../profile/client', () => ({ getProfile: vi.fn().mockResolvedValue(null) }));
vi.mock('../state/highscores', () => ({ getGamesPlayed: () => 1 }));

beforeEach(() => vi.clearAllMocks());

describe('StartModes tabs', () => {
  it('defaults to the Games tab and switches to Leaderboard', async () => {
    render(<StartModes onPick={vi.fn()} onCreate={vi.fn()} onNeedAccount={vi.fn()} />);
    // Daily Set is always visible.
    expect(screen.getByTestId('daily-set')).toBeInTheDocument();
    // Games tab is default → RecentGames shown, mode-list not.
    expect(screen.getByTestId('recent-games')).toBeInTheDocument();
    expect(screen.queryByTestId('mode-list')).not.toBeInTheDocument();
    // Switch to Leaderboard → mode-list shown, RecentGames gone.
    fireEvent.click(screen.getByTestId('tab-leaderboard'));
    await waitFor(() => expect(screen.getByTestId('mode-list')).toBeInTheDocument());
    expect(screen.queryByTestId('recent-games')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/StartModes.test.tsx`
Expected: FAIL — no `tab-leaderboard` / Games tab wiring yet.

- [ ] **Step 3: Add the import and tab state**

In `src/ui/StartModes.tsx`, add the import next to the other `./` imports (after the `DailySet` import on line 15):

```typescript
import { RecentGames } from './RecentGames';
```

Add the tab state right after the `const [win, setWin] = useState<TimeWindow>('today');` line:

```typescript
  const [tab, setTab] = useState<'games' | 'leaderboard'>('games');
```

- [ ] **Step 4: Replace the return JSX**

Replace the entire `return ( ... )` block (from `return (` through its matching `);` — currently lines 266–401) with:

```tsx
  return (
    <motion.div
      key="modes"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="bottom-sheet"
      style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '92%' }}
    >
      <div style={{ ...centered, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <DailySet />
        {gamesPlayed === 0 && views && views.length > 0 && (
          <button
            type="button"
            className="ember-btn"
            data-testid="quick-game"
            onClick={() => void startMostPlayedGame()}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0', fontSize: 15 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
            </svg>
            Quick Game
          </button>
        )}
      </div>

      {/* Tab switch: Games (recent cards) vs Leaderboard (ranked list). */}
      <div style={{ ...centered, display: 'flex', gap: 8, flexShrink: 0 }}>
        {(['games', 'leaderboard'] as const).map((t) => (
          <button
            key={t}
            type="button"
            data-testid={`tab-${t}`}
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              padding: '9px 0',
              borderRadius: 10,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 0.4,
              cursor: 'pointer',
              border: `1px solid ${tab === t ? 'var(--ember)' : 'var(--line-strong)'}`,
              background: tab === t ? 'var(--ember)' : 'transparent',
              color: tab === t ? '#1a1020' : 'var(--ink-1)',
            }}
          >
            {t === 'games' ? 'Games' : 'Leaderboard'}
          </button>
        ))}
      </div>

      {tab === 'games' ? (
        <div style={{ ...centered, flex: '1 1 auto', minHeight: 0, overflowY: 'auto', paddingBottom: 160 }}>
          <RecentGames onPick={onPick} />
        </div>
      ) : (
        <>
          {/* Compact, horizontally-swipeable time-window pills. */}
          <div
            style={{
              ...centered,
              display: 'flex',
              gap: 6,
              flexShrink: 0,
              overflowX: 'auto',
              flexWrap: 'nowrap',
              scrollbarWidth: 'none',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {WINDOW_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setWin(t.key)}
                aria-pressed={win === t.key}
                style={{
                  flex: '0 0 auto',
                  minHeight: 0,
                  padding: '7px 16px',
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: 0.4,
                  borderRadius: 999,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  border: `1px solid ${win === t.key ? 'var(--ember)' : 'var(--line-strong)'}`,
                  background: win === t.key ? 'var(--ember)' : 'transparent',
                  color: win === t.key ? '#1a1020' : 'var(--ink-1)',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ ...centered, flex: '1 1 auto', minHeight: 0 }}>
           <PullToRefresh onRefresh={loadViews}>
            <div
              data-testid="mode-list"
              style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 160 }}
            >
            {views === null ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                <span className="spinner" />
              </div>
            ) : views.length === 0 ? (
              <p data-testid="modes-empty" style={{ color: 'var(--ink-1)', fontSize: 14, textAlign: 'center', margin: 0 }}>
                No modes yet — tap + to create one.
              </p>
            ) : (
              views.map(({ mode, standing, top, recent }) => (
                <ModeRow
                  key={mode.id}
                  name={mode.name}
                  standing={standing}
                  top={win === 'recent' ? (recent && { name: recent.name, score: recent.score, country: recent.country }) : top}
                  plays={mode.entry_count}
                  onSelect={() => onPick(mode)}
                />
              ))
            )}
            </div>
           </PullToRefresh>
          </div>
        </>
      )}

      {views && views.length > 0 && (
        <button
          type="button"
          data-testid="advance-fab"
          aria-label="Random game"
          className={`fab advance-fab${advanceOpen ? ' is-open' : ''}`}
          onClick={onAdvanceClick}
        >
          <span className="fab-plus" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 3 21 3 21 8" />
              <line x1="4" y1="20" x2="21" y2="3" />
              <polyline points="21 16 21 21 16 21" />
              <line x1="15" y1="15" x2="21" y2="21" />
              <line x1="4" y1="4" x2="9" y2="9" />
            </svg>
          </span>
          <span className="fab-label">Random game</span>
        </button>
      )}

      <button
        type="button"
        data-testid="create-mode-btn"
        aria-label="Create Mode"
        aria-disabled={!hasName}
        className={`fab create-fab${fabOpen ? ' is-open' : ''}`}
        onClick={onFabClick}
        style={!hasName ? { opacity: 0.45 } : undefined}
      >
        <span className="fab-plus" aria-hidden>+</span>
        <span className="fab-label">Create Mode</span>
      </button>
    </motion.div>
  );
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/ui/StartModes.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add src/ui/StartModes.tsx src/ui/StartModes.test.tsx
git commit -m "feat(ui): Games/Leaderboard tabs on the start screen"
```

---

### Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: no output (clean).

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: all test files pass (the previous suite total + the new tests).

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: `✓ built` with no TypeScript errors.

- [ ] **Step 4: Commit any fixups**

Only if Steps 1–3 surfaced fixes:

```bash
git add -A
git commit -m "fix: resolve typecheck/test fallout for Games tab"
```

---

## Self-review notes

- **Spec coverage:** Daily Set always visible (Task 4 render); Games default (Task 4 state + test); 4 recent cards from server runs (Tasks 1–3); fallback to popular when <4 (Task 3 + `fillToLimit`); click → existing `ModeDetail` via `onPick` (Task 4 wiring); Leaderboard tab = today's pills+list verbatim (Task 4). All covered.
- **Approximation noted in spec:** "recently played" = recency of best-run `created_at`. No code change needed.
- **Type consistency:** `fetchRecentGames`/`fillToLimit` operate on `CustomMode`; `listModes` returns `CustomModeListItem extends CustomMode` (assignable); `onPick(mode: CustomMode)` accepts both. `fetchModeTopScores(modeId, 1)` returns `GlobalEntry[]`; `leader` typed `GlobalEntry | null`.
- **No new RPC/migration/deploy:** reads the existing public `leaderboard_top` view.
