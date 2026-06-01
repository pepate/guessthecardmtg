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
