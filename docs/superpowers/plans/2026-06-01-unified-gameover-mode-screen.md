# Unified game-over / mode screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the game-over screen reuse the mode-detail screen, and only create a leaderboard entry once the player has a name — otherwise show a tappable LOGIN that opens User Settings.

**Architecture:** Extract the mode-detail body from `RevealPicker` into a presentational `ModeDetail` component used by both the idle picker and the game-over screen. A new `usePendingRun` hook (used by `App` in the game-over context) owns projected-rank + posting; it feeds `ModeDetail` a ready `pendingRow`. Tapping LOGIN opens `ProfilePanel` as an overlay; saving a name auto-posts the held run.

**Tech Stack:** React + TypeScript, Vite, Zustand store, framer-motion, Supabase (RPC + edge function), Vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-06-01-unified-gameover-mode-screen-design.md`

---

## File structure

- **Create** `src/leaderboard/usePendingRun.ts` — hook: projected rank, name resolution, auto/explicit post.
- **Create** `src/leaderboard/usePendingRun.test.ts` — hook behaviour (mocked deps).
- **Create** `src/ui/ModeDetail.tsx` — shared mode-detail screen (extracted from RevealPicker + pending row).
- **Create** `src/ui/ModeDetail.test.tsx` — rendering incl. pending row / LOGIN.
- **Modify** `src/ui/RevealPicker.tsx` — thin wrapper over `ModeDetail`.
- **Modify** `src/ui/ProfilePanel.tsx` — optional `onNameSaved` + `ensureSession` props.
- **Modify** `src/App.tsx` — game-over renders `ModeDetail` + `usePendingRun` + profile overlay; drop `GameOver`.
- **Delete** `src/ui/GameOver.tsx`, `src/ui/GameOverLeaderboard.tsx`, `src/ui/GameOverOnboard.tsx`.
- **Delete** `src/ui/GameOverLeaderboard.test.tsx` (replaced by hook + ModeDetail tests).

Reference for shared types/helpers (do not modify): `Run` (`src/leaderboard/boards.ts`), `GlobalEntry`/`SubmitPayload` (`src/leaderboard/types.ts`), `submitScore`/`fetchModeProjectedRank`/`fetchModeTopScores`/`fetchRevealLeaders`/`fetchModeRuns`/`isLeaderboardEnabled` (`src/leaderboard/client.ts`), `getUserId`/`ensureUserId` (`src/leaderboard/identity.ts`), `getProfile`/`upsertDisplayName` (`src/profile/client.ts`), `findExistingMode`/`createMode` (`src/modes/client.ts`), `sanitizeName` (`src/leaderboard/validation.ts`), `REVEAL_MODE_LABELS` (`src/reveal/labels.ts`), `countryToFlag` (`src/leaderboard/flag.ts`), `formatAge` (`src/leaderboard/age.ts`), `ScoreValue` (`src/ui/ScoreValue.tsx`), `FilterChips` (`src/ui/FilterChips.tsx`), `buildDeeplink` (`src/share/deeplink.ts`), `fetchEnabledRevealModes` (`src/reveal/client.ts`).

---

## Task 1: `usePendingRun` hook

**Files:**
- Create: `src/leaderboard/usePendingRun.ts`
- Test: `src/leaderboard/usePendingRun.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/leaderboard/usePendingRun.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { usePendingRun, type PendingRun } from './usePendingRun';

vi.mock('./client', () => ({
  isLeaderboardEnabled: () => true,
  fetchModeProjectedRank: vi.fn(async () => ({ rank: 3, total: 9 })),
  submitScore: vi.fn(async () => ({ ok: true, id: 'row1', rank: 2 })),
}));
vi.mock('./identity', () => ({ getUserId: vi.fn(async () => 'uid1') }));
vi.mock('../profile/client', () => ({ getProfile: vi.fn(async () => null) }));
vi.mock('../modes/client', () => ({
  findExistingMode: vi.fn(async () => null),
  createMode: vi.fn(async () => ({ ok: true, mode: { id: 'm1' } })),
}));

import { getProfile } from '../profile/client';
import { submitScore } from './client';

const run: PendingRun = { score: 100, correct: 4, cards: 6, gameMode: 'blur' };

// Harness exposes the hook's output to the DOM so we can assert on it.
function Harness({ modeId }: { modeId: string | null }) {
  const s = usePendingRun(run, modeId, { types: ['Creature'] });
  return (
    <div>
      <span data-testid="needs-login">{String(s.needsLogin)}</span>
      <span data-testid="projected">{String(s.projectedRank)}</span>
      <span data-testid="posted">{String(s.postedRank)}</span>
      <button data-testid="post-now" onClick={() => void s.postNow()}>post</button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('usePendingRun', () => {
  it('shows LOGIN and does NOT post when the player has no name', async () => {
    render(<Harness modeId="m1" />);
    await waitFor(() => expect(screen.getByTestId('projected').textContent).toBe('3'));
    expect(screen.getByTestId('needs-login').textContent).toBe('true');
    expect(submitScore).not.toHaveBeenCalled();
  });

  it('auto-posts when the player already has a name', async () => {
    (getProfile as unknown as vi.Mock).mockResolvedValueOnce({ displayName: 'Pete' });
    render(<Harness modeId="m1" />);
    await waitFor(() => expect(screen.getByTestId('posted').textContent).toBe('2'));
    expect(submitScore).toHaveBeenCalledOnce();
    expect(screen.getByTestId('needs-login').textContent).toBe('false');
  });

  it('postNow() posts after a name has been saved', async () => {
    render(<Harness modeId="m1" />);
    await waitFor(() => expect(screen.getByTestId('needs-login').textContent).toBe('true'));
    (getProfile as unknown as vi.Mock).mockResolvedValueOnce({ displayName: 'Pete' });
    await act(async () => { screen.getByTestId('post-now').click(); });
    await waitFor(() => expect(screen.getByTestId('posted').textContent).toBe('2'));
    expect(submitScore).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/leaderboard/usePendingRun.test.ts`
Expected: FAIL — `usePendingRun` does not exist.

- [ ] **Step 3: Write the hook**

```ts
// src/leaderboard/usePendingRun.ts
import { useEffect, useState } from 'react';
import type { RevealMode } from '../engine/timeAttack';
import type { CustomFilter } from '../modes/filter';
import { sanitizeName } from './validation';
import { isLeaderboardEnabled, fetchModeProjectedRank, submitScore } from './client';
import { getUserId } from './identity';
import { getProfile } from '../profile/client';
import { findExistingMode, createMode } from '../modes/client';

export interface PendingRun {
  score: number;
  correct: number;
  cards: number;
  gameMode: RevealMode;
}

export interface PendingRunState {
  status: 'idle' | 'sending' | 'done' | 'error';
  projectedRank: number | null;
  projectedTotal: number | null;
  postedRank: number | null;
  postedId: string | null;
  name: string | null;
  needsLogin: boolean;
  postNow: () => Promise<boolean>;
}

const NAME_KEY = 'guessthecard.playername';

export function usePendingRun(
  run: PendingRun | null,
  modeId: string | null,
  modeFilter: CustomFilter | null,
): PendingRunState {
  const active = !!run && isLeaderboardEnabled() && run.score > 0;

  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [projected, setProjected] = useState<{ rank: number; total: number } | null>(null);
  const [posted, setPosted] = useState<{ rank: number; id: string } | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);

  async function doPost(clean: string): Promise<boolean> {
    if (!run) return false;
    setStatus('sending');
    let resolvedModeId = modeId;
    if (!resolvedModeId) {
      if (!modeFilter) { setStatus('error'); return false; }
      const existing = await findExistingMode(modeFilter).catch(() => null);
      if (existing) {
        resolvedModeId = existing.id;
      } else {
        const created = await createMode(modeFilter).catch(() => null);
        if (!created || !created.ok) { setStatus('error'); return false; }
        resolvedModeId = created.mode.id;
      }
    }
    const res = await submitScore({
      name: clean,
      score: run.score,
      correct: run.correct,
      cards: run.cards,
      modeId: resolvedModeId,
      gameMode: run.gameMode,
    });
    if (!res.ok) { setStatus('error'); return false; }
    localStorage.setItem(NAME_KEY, clean);
    setName(clean);
    setNeedsLogin(false);
    setPosted({ rank: res.rank, id: res.id });
    setStatus('done');
    return true;
  }

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      if (modeId) {
        fetchModeProjectedRank(modeId, run!.score)
          .then((r) => { if (!cancelled) setProjected(r); })
          .catch(() => {});
      } else {
        setProjected({ rank: 1, total: 0 });
      }
      const uid = await getUserId();
      if (cancelled) return;
      const profile = uid ? await getProfile(uid).catch(() => null) : null;
      if (cancelled) return;
      const known = sanitizeName(profile?.displayName ?? localStorage.getItem(NAME_KEY) ?? '');
      if (!known) { setNeedsLogin(true); return; }
      await doPost(known);
    })().catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, modeId, run?.score]);

  async function postNow(): Promise<boolean> {
    const uid = await getUserId();
    const profile = uid ? await getProfile(uid).catch(() => null) : null;
    const known = sanitizeName(profile?.displayName ?? localStorage.getItem(NAME_KEY) ?? '');
    if (!known) return false;
    return doPost(known);
  }

  return {
    status,
    projectedRank: projected?.rank ?? null,
    projectedTotal: projected?.total ?? null,
    postedRank: posted?.rank ?? null,
    postedId: posted?.id ?? null,
    name,
    needsLogin,
    postNow,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/leaderboard/usePendingRun.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/leaderboard/usePendingRun.ts src/leaderboard/usePendingRun.test.ts
git commit -m "feat(leaderboard): usePendingRun hook (projected rank + login-gated post)"
```

---

## Task 2: `ModeDetail` component

Extract the mode-detail body from `RevealPicker` into a presentational component and add the pending-run row. `ModeDetail` does NOT post — it receives a ready `pendingRow` and renders it.

**Files:**
- Create: `src/ui/ModeDetail.tsx`
- Test: `src/ui/ModeDetail.test.tsx`

- [ ] **Step 1: Write `ModeDetail.tsx`**

Create the file with this exact content:

```tsx
// src/ui/ModeDetail.tsx
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { GlobalEntry } from '../leaderboard/types';
import type { RevealMode } from '../engine/timeAttack';
import type { CustomFilter } from '../modes/filter';
import type { Run } from '../leaderboard/boards';
import { fetchRevealLeaders, fetchModeRuns } from '../leaderboard/client';
import { fetchEnabledRevealModes } from '../reveal/client';
import { REVEAL_MODE_LABELS } from '../reveal/labels';
import { formatAge } from '../leaderboard/age';
import { useGameStore } from '../state/gameStore';
import { ScoreValue } from './ScoreValue';
import { countryToFlag } from '../leaderboard/flag';
import { buildDeeplink } from '../share/deeplink';
import { FilterChips } from './FilterChips';

export interface PendingRowInfo {
  rank: number;
  /** Player's name, or null → render a tappable LOGIN instead. */
  name: string | null;
  score: number;
  correct: number;
  gameMode: RevealMode;
  onLogin: () => void;
}

interface ModeDetailProps {
  modeId: string | null;
  modeName: string;
  filter: CustomFilter;
  cardCount?: number;
  pendingRow?: PendingRowInfo | null;
}

const PENDING_ID = '__pending__';

export function ModeDetail({ modeId, modeName, filter, cardCount, pendingRow }: ModeDetailProps) {
  const [leaders, setLeaders] = useState<Record<RevealMode, GlobalEntry | null> | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [enabled, setEnabled] = useState<RevealMode[] | null>(null);
  const [copied, setCopied] = useState<RevealMode | null>(null);
  const [confirm, setConfirm] = useState<RevealMode | null>(null);
  const [idleHint, setIdleHint] = useState<string | null>(null);
  const [tab, setTab] = useState<'leaderboard' | 'recent'>('leaderboard');
  const [expanded, setExpanded] = useState(false);

  const touchDevice = () => typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches;

  async function share(reveal: RevealMode) {
    if (!modeId) return;
    const url = buildDeeplink(modeId, reveal);
    const title = `${modeName} · ${REVEAL_MODE_LABELS[reveal]} — beat my score!`;
    try {
      if (navigator.share) {
        await navigator.share({ url, title });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(reveal);
        setTimeout(() => setCopied((c) => (c === reveal ? null : c)), 1500);
      }
    } catch {
      /* user dismissed the share sheet — ignore */
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const en = await fetchEnabledRevealModes();
      if (cancelled) return;
      setEnabled(en);
      if (!modeId) { setLeaders({} as Record<RevealMode, GlobalEntry | null>); setRuns([]); return; }
      const [lead, modeRuns] = await Promise.all([fetchRevealLeaders(modeId), fetchModeRuns(modeId)]);
      if (cancelled) return;
      setLeaders(lead);
      setRuns(modeRuns);
    })().catch(() => {
      if (!cancelled) setEnabled([]);
    });
    return () => { cancelled = true; };
  }, [modeId]);

  function play(reveal: RevealMode) {
    const store = useGameStore.getState();
    store.setRevealChoice(reveal);
    void store.selectPool({ kind: 'custom', modeId: modeId ?? undefined, filter, name: modeName });
  }

  function choose(reveal: RevealMode) {
    if (touchDevice()) setConfirm(reveal);
    else play(reveal);
  }

  const now = Date.now();
  const PAGE = 8;

  const played = runs.filter((r) => r.gameMode);
  const byScore = [...played].sort((a, b) => b.score - a.score || a.createdAt - b.createdAt);
  const byRecent = [...played].sort((a, b) => b.createdAt - a.createdAt);

  const pendingSynthetic: Run | null = pendingRow
    ? {
        id: PENDING_ID,
        name: pendingRow.name ?? '',
        score: pendingRow.score,
        correct: pendingRow.correct,
        gameMode: pendingRow.gameMode,
        deviceId: PENDING_ID,
        country: null,
        createdAt: now,
      }
    : null;

  const leaderboardList = pendingSynthetic
    ? [...byScore.slice(0, Math.max(0, pendingRow!.rank - 1)), pendingSynthetic, ...byScore.slice(Math.max(0, pendingRow!.rank - 1))]
    : byScore;
  const recentList = pendingSynthetic ? [pendingSynthetic, ...byRecent] : byRecent;
  const activeList = tab === 'leaderboard' ? leaderboardList : recentList;
  const shown = expanded ? activeList : activeList.slice(0, PAGE);
  const hasMore = activeList.length > PAGE && !expanded;

  function switchTab(next: 'leaderboard' | 'recent') {
    setTab(next);
    setExpanded(false);
  }

  const idleKey = useMemo(
    () => [...shown.map((r) => `row:${r.id}`), ...(enabled ?? []).map((rv) => `reveal:${rv}`)].join('|'),
    [shown, enabled],
  );

  useEffect(() => {
    const candidates = idleKey ? idleKey.split('|') : [];
    if (candidates.length === 0 || confirm) return;
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(timer);
      setIdleHint(null);
      timer = setTimeout(() => {
        setIdleHint(candidates[Math.floor(Math.random() * candidates.length)]);
      }, 10000);
    };
    arm();
    window.addEventListener('pointerdown', arm);
    window.addEventListener('pointermove', arm);
    window.addEventListener('keydown', arm);
    window.addEventListener('wheel', arm);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', arm);
      window.removeEventListener('pointermove', arm);
      window.removeEventListener('keydown', arm);
      window.removeEventListener('wheel', arm);
    };
  }, [idleKey, confirm]);

  const hasList = played.length > 0 || !!pendingSynthetic;

  return (
    <motion.div
      key="picker"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="bottom-sheet"
      style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '92%' }}
    >
      <div style={{ width: '100%', maxWidth: 700, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, paddingRight: 96 }}>
        <span style={{ flex: 1, color: 'var(--ink-0)', fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {modeName}
        </span>
      </div>

      <div style={{ width: '100%', maxWidth: 700, margin: '0 auto', flex: '1 1 auto', minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <FilterChips filter={filter} />
          {cardCount != null && (
            <div style={{ textAlign: 'center', color: 'var(--ink-2)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
              {cardCount.toLocaleString()} cards
            </div>
          )}
        </div>

        {hasList && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['leaderboard', 'recent'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  data-testid={`picker-tab-${t}`}
                  aria-pressed={tab === t}
                  onClick={() => switchTab(t)}
                  style={{
                    flex: 1,
                    padding: '7px 10px',
                    borderRadius: 8,
                    border: `1px solid ${tab === t ? 'var(--ember)' : 'var(--line)'}`,
                    background: tab === t ? 'rgba(255,122,44,0.12)' : 'rgba(20,17,28,0.45)',
                    color: tab === t ? 'var(--ember-hot)' : 'var(--ink-2)',
                    cursor: 'pointer',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                  }}
                >
                  {t === 'leaderboard' ? 'Leaderboard' : 'Recent games'}
                </button>
              ))}
            </div>
            {shown.map((r, i) => {
              if (r.id === PENDING_ID && pendingRow) {
                return (
                  <div
                    key={PENDING_ID}
                    data-testid="pending-run-row"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
                      padding: '8px 12px', borderRadius: 10, border: '1px solid var(--ember)',
                      background: 'rgba(255,138,60,0.18)',
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                    }}
                  >
                    {tab === 'leaderboard' && (
                      <span style={{ flex: '0 0 auto', color: 'var(--ink-2)', width: 22 }}>#{i + 1}</span>
                    )}
                    <span aria-hidden>{countryToFlag(null)}</span>
                    {pendingRow.name == null ? (
                      <button
                        type="button"
                        data-testid="pending-login"
                        onClick={pendingRow.onLogin}
                        style={{
                          flex: 1, minWidth: 0, textAlign: 'left', background: 'transparent',
                          border: 'none', cursor: 'pointer', color: 'var(--ember-hot)',
                          fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: 1,
                          textTransform: 'uppercase', padding: 0,
                        }}
                      >
                        Login
                      </button>
                    ) : (
                      <span style={{ flex: 1, minWidth: 0, color: 'var(--ink-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {pendingRow.name}
                      </span>
                    )}
                    <span style={{ flex: '0 0 auto', color: 'var(--ink-2)', fontSize: 11 }}>
                      {REVEAL_MODE_LABELS[pendingRow.gameMode]}
                    </span>
                    <ScoreValue score={pendingRow.score} fontSize={12} />
                  </div>
                );
              }
              return (
                <button
                  key={r.id}
                  type="button"
                  data-testid="game-row"
                  className={idleHint === `row:${r.id}` ? 'idle-hint' : undefined}
                  onClick={() => r.gameMode && choose(r.gameMode)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
                    padding: '8px 12px', borderRadius: 10, border: '1px solid var(--line)',
                    background: 'rgba(20,17,28,0.45)', cursor: 'pointer',
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                  }}
                >
                  {tab === 'leaderboard' && (
                    <span style={{ flex: '0 0 auto', color: 'var(--ink-2)', width: 22 }}>#{i + 1}</span>
                  )}
                  <span aria-hidden>{countryToFlag(r.country)}</span>
                  <span style={{ flex: 1, minWidth: 0, color: 'var(--ink-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                  <span style={{ flex: '0 0 auto', color: 'var(--ink-2)', fontSize: 11 }}>
                    {r.gameMode ? REVEAL_MODE_LABELS[r.gameMode] : ''}
                    {tab === 'recent' ? ` · ${formatAge(r.createdAt, now)}` : ''}
                  </span>
                  <ScoreValue score={r.score} fontSize={12} />
                </button>
              );
            })}
            {hasMore && (
              <button
                type="button"
                data-testid="picker-more"
                onClick={() => setExpanded(true)}
                style={{
                  padding: '7px 10px', borderRadius: 8, border: '1px solid var(--line)',
                  background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                }}
              >
                More ({activeList.length - PAGE})
              </button>
            )}
          </div>
        )}

        <p style={{ margin: '2px 0 0', color: 'var(--ink-2)', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
          Pick a reveal mode · beat the holder
        </p>

        <div data-testid="reveal-list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {enabled === null ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
              <span className="spinner" />
            </div>
          ) : (
            enabled.map((reveal) => {
              const leader = leaders?.[reveal] ?? null;
              return (
                <div
                  key={reveal}
                  data-testid="reveal-row"
                  data-reveal={reveal}
                  role="button"
                  className={idleHint === `reveal:${reveal}` ? 'idle-hint' : undefined}
                  onClick={() => choose(reveal)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                    padding: '12px 14px', borderRadius: 12, border: '1px solid var(--line-strong)',
                    background: 'rgba(20,17,28,0.6)', cursor: 'pointer',
                  }}
                >
                  <span style={{ width: 92, color: 'var(--ink-0)', fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 700 }}>
                    {REVEAL_MODE_LABELS[reveal]}
                  </span>
                  <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--ink-2)', minWidth: 0 }}>
                    {leader ? (
                      <>
                        <span aria-hidden>{countryToFlag(leader.country)}</span>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{leader.name}</span>
                        <span style={{ flex: '0 0 auto', color: 'var(--ink-2)', fontSize: 11 }}>{formatAge(leader.createdAt, now)}</span>
                        <ScoreValue score={leader.score} fontSize={13} />
                      </>
                    ) : (
                      <span style={{ flex: 1 }}>open · no scores</span>
                    )}
                  </span>
                  <button
                    type="button"
                    data-testid="reveal-share"
                    aria-label={`Share ${REVEAL_MODE_LABELS[reveal]} challenge`}
                    onClick={(e) => { e.stopPropagation(); void share(reveal); }}
                    style={{
                      flexShrink: 0, background: 'transparent', border: '1px solid var(--line)',
                      borderRadius: 8, color: copied === reveal ? 'var(--ember-hot)' : 'var(--ink-2)',
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 10, padding: '5px 8px', cursor: 'pointer',
                    }}
                  >
                    {copied === reveal ? 'copied' : 'share'}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {confirm && (
        <div
          data-testid="play-confirm"
          onClick={() => setConfirm(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 20, display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: 24, background: 'rgba(5,4,8,0.8)',
            backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
          }}
        >
          <button
            type="button"
            data-testid="play-confirm-btn"
            className="ember-btn"
            onClick={(e) => { e.stopPropagation(); play(confirm); }}
            style={{ width: '100%', maxWidth: 420, minHeight: 76, fontSize: 24 }}
          >
            Play {REVEAL_MODE_LABELS[confirm]}
          </button>
        </div>
      )}
    </motion.div>
  );
}
```

> Note: `selectPool` is called with `modeId: modeId ?? undefined`. Verify `selectPool`'s param type accepts `undefined` for `modeId`; if it requires `string | null`, use `modeId ?? null` instead. Check `src/state/gameStore.ts` `selectPool` signature before finalizing this line.

- [ ] **Step 2: Write `ModeDetail.test.tsx`**

```tsx
// src/ui/ModeDetail.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ModeDetail } from './ModeDetail';

vi.mock('../leaderboard/client', () => ({
  fetchRevealLeaders: vi.fn(async () => ({})),
  fetchModeRuns: vi.fn(async () => []),
}));
vi.mock('../reveal/client', () => ({ fetchEnabledRevealModes: vi.fn(async () => ['blur', 'scanner']) }));

const filter = { types: ['Creature'] };

beforeEach(() => vi.clearAllMocks());

describe('ModeDetail', () => {
  it('renders the mode name, card count and the reveal list', async () => {
    render(<ModeDetail modeId="m1" modeName="EDHRec 1000" filter={filter} cardCount={1000} />);
    expect(screen.getByText('EDHRec 1000')).toBeTruthy();
    expect(screen.getByText('1,000 cards')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByTestId('reveal-row').length).toBe(2));
  });

  it('shows a LOGIN pending row when the run has no name', async () => {
    const onLogin = vi.fn();
    render(
      <ModeDetail
        modeId="m1"
        modeName="EDHRec 1000"
        filter={filter}
        pendingRow={{ rank: 1, name: null, score: 500, correct: 5, gameMode: 'blur', onLogin }}
      />,
    );
    const row = await screen.findByTestId('pending-run-row');
    expect(row).toBeTruthy();
    screen.getByTestId('pending-login').click();
    expect(onLogin).toHaveBeenCalledOnce();
  });

  it('shows the name (no LOGIN) in the pending row once a name is present', async () => {
    render(
      <ModeDetail
        modeId="m1"
        modeName="EDHRec 1000"
        filter={filter}
        pendingRow={{ rank: 2, name: 'Pete', score: 500, correct: 5, gameMode: 'blur', onLogin: () => {} }}
      />,
    );
    const row = await screen.findByTestId('pending-run-row');
    expect(row.textContent).toContain('Pete');
    expect(screen.queryByTestId('pending-login')).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `npx vitest run src/ui/ModeDetail.test.tsx`
Expected: PASS (3 tests). If the card-count assertion fails on locale, confirm `toLocaleString()` output in the test env and adjust the expected string.

- [ ] **Step 4: Commit**

```bash
git add src/ui/ModeDetail.tsx src/ui/ModeDetail.test.tsx
git commit -m "feat(ui): ModeDetail shared mode-detail screen with pending-run/LOGIN row"
```

---

## Task 3: `RevealPicker` becomes a thin wrapper

**Files:**
- Modify: `src/ui/RevealPicker.tsx` (replace entire file)

- [ ] **Step 1: Replace the file content**

```tsx
// src/ui/RevealPicker.tsx
import type { CustomMode } from '../modes/types';
import { ModeDetail } from './ModeDetail';

export function RevealPicker({ mode }: { mode: CustomMode }) {
  return (
    <ModeDetail
      modeId={mode.id}
      modeName={mode.name}
      filter={mode.filter}
      cardCount={mode.card_count}
    />
  );
}
```

- [ ] **Step 2: Verify the idle picker still renders**

Run: `npx vitest run src/ui` then `npx tsc -b`
Expected: no type errors; tests pass. (RevealPicker had no dedicated test; ModeDetail tests cover the body.)

- [ ] **Step 3: Commit**

```bash
git add src/ui/RevealPicker.tsx
git commit -m "refactor(ui): RevealPicker delegates to ModeDetail"
```

---

## Task 4: `ProfilePanel` — `onNameSaved` + `ensureSession`

Add two optional props so the game-over LOGIN flow can (a) guarantee an anon session exists before saving a name and (b) be notified when a name was saved (to auto-post).

**Files:**
- Modify: `src/ui/ProfilePanel.tsx`
- Test: `src/ui/ProfilePanel.test.tsx`

- [ ] **Step 1: Add the props to the component signature**

Find:
```tsx
export function ProfilePanel() {
```
Replace with:
```tsx
export function ProfilePanel({ onNameSaved, ensureSession }: { onNameSaved?: () => void; ensureSession?: boolean } = {}) {
```

- [ ] **Step 2: Ensure an anon session when `ensureSession` is set**

Add this import near the other identity import (the file already imports `getUserId` — find where and add `ensureUserId`). In `src/ui/ProfilePanel.tsx`, change the identity import to include `ensureUserId`:
```tsx
import { getUserId, ensureUserId } from '../leaderboard/identity';
```
Then find the uid-loading effect:
```tsx
  useEffect(() => {
    getUserId().then(id => {
      setUid(id);
```
Replace the `getUserId()` call with a conditional:
```tsx
  useEffect(() => {
    (ensureSession ? ensureUserId() : getUserId()).then(id => {
      setUid(id);
```
(Leave the rest of the effect body unchanged.)

- [ ] **Step 3: Fire `onNameSaved` after a successful name save**

Find, in `handleNameSave`:
```tsx
    setProfile(prev => prev ? { ...prev, displayName: clean } : null);
    setNotice('Name saved.');
  }
```
Replace with:
```tsx
    setProfile(prev => prev ? { ...prev, displayName: clean } : null);
    setNotice('Name saved.');
    onNameSaved?.();
  }
```

- [ ] **Step 4: Add a test for the new behaviour**

Append to `src/ui/ProfilePanel.test.tsx` (inside the existing top-level `describe`, or add a new one). The existing test file already mocks the profile/identity/auth modules — reuse those mocks. Add:

```tsx
it('calls onNameSaved after saving a name', async () => {
  // Mocks: ensureUserId/getUserId resolve a uid, checkNameAvailable true, upsertDisplayName ok.
  const onNameSaved = vi.fn();
  render(<ProfilePanel onNameSaved={onNameSaved} ensureSession />);
  const input = await screen.findByTestId('profile-name-input');
  fireEvent.change(input, { target: { value: 'NewName' } });
  fireEvent.click(screen.getByTestId('profile-name-save'));
  await waitFor(() => expect(onNameSaved).toHaveBeenCalled());
});
```

> Before writing the assertion, open `src/ui/ProfilePanel.test.tsx` and match the existing mock setup (module mock names + how `upsertDisplayName`/`checkNameAvailable` are stubbed). Ensure `checkNameAvailable` resolves `true` and `upsertDisplayName` resolves `{ ok: true }` for this case. Import `fireEvent`/`waitFor`/`vi` if not already imported.

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run src/ui/ProfilePanel.test.tsx && npx tsc -b`
Expected: PASS; no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/ui/ProfilePanel.tsx src/ui/ProfilePanel.test.tsx
git commit -m "feat(ui): ProfilePanel onNameSaved + ensureSession for the login-from-gameover flow"
```

---

## Task 5: Wire game-over to `ModeDetail` + `usePendingRun` + profile overlay

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Update imports**

In `src/App.tsx`, remove the `GameOver` import:
```tsx
import { GameOver } from './ui/GameOver';
```
Add:
```tsx
import { ModeDetail } from './ui/ModeDetail';
import { usePendingRun } from './leaderboard/usePendingRun';
```
(Keep the existing `GameOverArtwork`, `ProfilePanel`, `RevealPicker` imports.)

- [ ] **Step 2: Add game-over pending-run state + hook**

In the `App` component body, after the existing store selectors (`totalScore`, `correctCount`, `currentModeId`, `currentModeName`, `currentModeFilter`, `gameMode`, `roundIndex` are already read elsewhere in the file — reuse them; if any are not yet selected in `App`, add the matching `useGameStore((s) => s.xxx)` selectors), add:

```tsx
  const [gameOverProfileOpen, setGameOverProfileOpen] = useState(false);

  const pendingRunInput = phase === 'gameover' && totalScore > 0
    ? { score: totalScore, correct: correctCount, cards: roundIndex + 1, gameMode }
    : null;
  const pending = usePendingRun(pendingRunInput, currentModeId, currentModeFilter);

  const gameOverPendingRow = pendingRunInput && pending.projectedRank != null
    ? {
        rank: pending.postedRank ?? pending.projectedRank,
        name: pending.needsLogin ? null : (pending.name ?? null),
        score: pendingRunInput.score,
        correct: pendingRunInput.correct,
        gameMode: pendingRunInput.gameMode,
        onLogin: () => setGameOverProfileOpen(true),
      }
    : null;
```

> `usePendingRun` is a hook and must be called unconditionally on every render (pass `null` when not in game-over — it no-ops internally). Confirm `totalScore`, `correctCount`, `roundIndex`, `gameMode`, `currentModeId`, `currentModeName`, `currentModeFilter` are read via `useGameStore` in `App`; add any missing selectors.

- [ ] **Step 3: Close the overlay when leaving game-over**

Find the existing effect:
```tsx
  useEffect(() => {
    if (phase !== 'idle') setView({ s: 'list' });
  }, [phase]);
```
Add directly below it:
```tsx
  useEffect(() => {
    if (phase !== 'gameover') setGameOverProfileOpen(false);
  }, [phase]);
```

- [ ] **Step 4: Replace the game-over render**

Find:
```tsx
          {phase === 'gameover' && (
            <GameOver onOpenProfile={() => { reset(); setView({ s: 'profile' }); }} />
          )}
```
Replace with:
```tsx
          {phase === 'gameover' && (
            <ModeDetail
              key="gameover"
              modeId={currentModeId}
              modeName={currentModeName ?? ''}
              filter={currentModeFilter ?? {}}
              pendingRow={gameOverPendingRow}
            />
          )}
```

- [ ] **Step 5: Render the profile overlay above game-over**

Immediately AFTER the closing `</AnimatePresence>` that wraps the overlay views (locate the `</AnimatePresence>` that closes the block opened by `<AnimatePresence mode="wait">` around the views), add:

```tsx
      {phase === 'gameover' && gameOverProfileOpen && (
        <div
          data-testid="gameover-profile-overlay"
          style={{
            position: 'fixed', inset: 0, zIndex: 40, overflowY: 'auto',
            background: 'rgba(5,4,8,0.92)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
            padding: 'calc(16px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom))',
          }}
        >
          <button
            type="button"
            data-testid="gameover-profile-close"
            aria-label="Close"
            onClick={() => setGameOverProfileOpen(false)}
            style={{
              position: 'absolute', top: 'calc(12px + env(safe-area-inset-top))', right: 12, zIndex: 1,
              width: 40, height: 40, borderRadius: 10, border: '1px solid var(--line-strong)',
              background: 'rgba(13,11,19,0.6)', color: 'var(--ink-0)', cursor: 'pointer',
            }}
          >
            ✕
          </button>
          <ProfilePanel
            ensureSession
            onNameSaved={() => { void pending.postNow(); setGameOverProfileOpen(false); }}
          />
        </div>
      )}
```

> Verify the insertion point compiles: the overlay must be a sibling JSX node inside the top-level returned `<div className="stage-root">`, not inside `<AnimatePresence mode="wait">`. If `ProfilePanel` relies on full-height layout, the overlay's `overflowY: 'auto'` container handles scrolling.

- [ ] **Step 6: Typecheck + build**

Run: `npx tsc -b`
Expected: no errors. Fix any missing store selectors or the `selectPool` modeId nullability noted in Task 2.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): game-over reuses ModeDetail with pending-run row + profile overlay"
```

---

## Task 6: Delete the old game-over screens + final verification

**Files:**
- Delete: `src/ui/GameOver.tsx`, `src/ui/GameOverLeaderboard.tsx`, `src/ui/GameOverOnboard.tsx`, `src/ui/GameOverLeaderboard.test.tsx`

- [ ] **Step 1: Confirm nothing else imports the deleted files**

Run: `grep -rn "GameOverLeaderboard\|GameOverOnboard\|from './GameOver'\|from './ui/GameOver'" src`
Expected: no remaining references (App was updated in Task 5). If any remain, remove them.

- [ ] **Step 2: Delete the files**

```bash
git rm src/ui/GameOver.tsx src/ui/GameOverLeaderboard.tsx src/ui/GameOverOnboard.tsx src/ui/GameOverLeaderboard.test.tsx
```

- [ ] **Step 3: Full typecheck, build and test**

Run: `npm run build && npx vitest run`
Expected: build succeeds; all tests pass. Fix fallout (e.g. stale imports, the e2e `golden-path.spec.ts` is already known-red per the spec context and is out of scope — do not block on it, but do not make it worse).

- [ ] **Step 4: Browser smoke test**

Start the preview (`guessthecard-dev`, port 5175) and verify, with the running app:
1. Play a mode to completion (or let the game time out).
2. Game-over shows the revealed card on top AND the mode-detail screen (mode name, filter chips, LEADERBOARD/RECENT tabs, reveal-mode list) — the same as tapping that mode.
3. A nameless player sees a highlighted "your run" row with **LOGIN** in the name slot and the correct `#rank` + score.
4. Tapping LOGIN opens the profile overlay; saving a name closes it and the row now shows the name + rank (entry posted).
5. Returning afterwards: playing again auto-posts (name exists) — the row shows name + rank with no LOGIN.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(ui): remove the standalone game-over screens (replaced by ModeDetail)"
```

---

## Self-review notes (for the implementer)

- **Spec coverage:** unified screen (Tasks 2,3,5) · card artwork kept on top (App already renders `GameOverArtwork` for `phase==='gameover'` — Task 5 leaves that intact) · pending row with rank (Tasks 2,5) · LOGIN when nameless + opens User Settings (Tasks 2,4,5) · entry created only after a name exists (Task 1 hook) · auto-post for named players (Task 1) · auto-post the held run after name save (Tasks 1,4,5) · delete old screens (Task 6).
- **Watch points flagged inline:** `selectPool` `modeId` nullability (Task 2), missing `useGameStore` selectors in `App` (Task 5 Step 2), overlay insertion point outside `AnimatePresence` (Task 5 Step 5), `ProfilePanel.test.tsx` existing mock shape (Task 4 Step 4).
