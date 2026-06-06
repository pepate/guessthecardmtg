import { useEffect, useRef, useState } from 'react';
import type { RevealMode } from '../engine/revealMode';
import type { CustomFilter } from '../modes/filter';
import { sanitizeName } from './validation';
import { isLeaderboardEnabled, fetchModeRuns, submitScore } from './client';
import { ownBestPerReveal, projectedSummedRank, nextZeroReveal } from './boards';
import { fetchEnabledRevealModes } from '../reveal/client';
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
  /** The next enabled reveal in this pool the device has 0 points in, or null. */
  nextMode: RevealMode | null;
  postNow: (nameOverride?: string) => Promise<boolean>;
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
  const [nextMode, setNextMode] = useState<RevealMode | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  async function doPost(clean: string): Promise<boolean> {
    if (!run) return false;
    if (mountedRef.current) setStatus('sending');
    let resolvedModeId = modeId;
    if (!resolvedModeId) {
      if (!modeFilter) { if (mountedRef.current) setStatus('error'); return false; }
      const existing = await findExistingMode(modeFilter).catch(() => null);
      if (existing) {
        resolvedModeId = existing.id;
      } else {
        const created = await createMode(modeFilter).catch(() => null);
        if (!created || !created.ok) { if (mountedRef.current) setStatus('error'); return false; }
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
    if (!res.ok) { if (mountedRef.current) setStatus('error'); return false; }
    localStorage.setItem(NAME_KEY, clean);
    // Recompute the pool total/rank from fresh runs (now including this row), so the
    // headline reflects the summed standing, not the edge function's single-best rank.
    const fresh = await fetchModeRuns(resolvedModeId).catch(() => []);
    const freshUid = await getUserId().catch(() => null);
    const proj = projectedSummedRank(fresh, freshUid ?? '', run.gameMode, run.score);
    if (mountedRef.current) {
      setName(clean);
      setNeedsLogin(false);
      setProjected(proj);
      setPosted({ rank: proj.rank, id: res.id });
      setStatus('done');
    }
    return true;
  }

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

  async function postNow(nameOverride?: string): Promise<boolean> {
    if (status === 'sending' || status === 'done') return false;
    // A freshly-claimed name is passed in directly so we never depend on a
    // read-after-write of the profile row. Fall back to the saved profile /
    // local name for the sign-in path.
    let known = sanitizeName(nameOverride ?? '');
    if (!known) {
      const uid = await getUserId();
      const profile = uid ? await getProfile(uid).catch(() => null) : null;
      known = sanitizeName(profile?.displayName ?? localStorage.getItem(NAME_KEY) ?? '');
    }
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
    nextMode,
    postNow,
  };
}
