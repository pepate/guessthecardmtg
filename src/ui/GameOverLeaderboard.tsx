import { useEffect, useState, type ReactNode } from 'react';
import type { GlobalEntry } from '../leaderboard/types';
import type { RevealMode } from '../engine/timeAttack';
import { sanitizeName } from '../leaderboard/validation';
import {
  isLeaderboardEnabled,
  fetchModeProjectedRank,
  fetchModeTopScores,
  submitScore,
} from '../leaderboard/client';
import { getUserId } from '../leaderboard/identity';
import { getProfile } from '../profile/client';
import { findExistingMode, createMode } from '../modes/client';
import type { CustomFilter } from '../modes/filter';
import { GlobalScoreList } from './GlobalScoreList';
import { GameOverOnboard } from './GameOverOnboard';

const NAME_KEY = 'guessthecard.playername';
const VISIBLE = 5;

export function GameOverLeaderboard({
  score,
  correct,
  cards,
  modeId,
  modeFilter,
  gameMode,
  shareButton,
  onPosted,
  onOpenProfile,
}: {
  score: number;
  correct: number;
  cards: number;
  modeId: string | null;
  modeFilter?: CustomFilter;
  gameMode: RevealMode;
  shareButton?: ReactNode;
  onPosted?: (info: { id: string; name: string; rank: number }) => void;
  onOpenProfile?: () => void;
}) {
  const enabled = isLeaderboardEnabled();
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? '');
  const [projected, setProjected] = useState<{ rank: number; total: number } | null>(null);
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [posted, setPosted] = useState<{ rank: number; id: string; name: string } | null>(null);
  const [top, setTop] = useState<GlobalEntry[]>([]);
  const [nameTaken, setNameTaken] = useState(false);
  const [needsName, setNeedsName] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);

  useEffect(() => { getUserId().then(setMyId).catch(() => {}); }, []);

  useEffect(() => {
    // When modeId is absent (unplayed set), skip fetching — no board exists yet.
    if (!enabled || score <= 0 || !modeId) return;
    let cancelled = false;
    const rankP = fetchModeProjectedRank(modeId, score);
    const topP = fetchModeTopScores(modeId, VISIBLE);
    rankP.then((r) => !cancelled && setProjected(r)).catch(() => {});
    topP.then((list) => !cancelled && setTop(list)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled, modeId, score]);

  // Players who already have a name post automatically. The name of record is the
  // server profile's display_name (works across devices); localStorage is only a
  // fallback. Players with no name yet get the onboarding overlay instead.
  useEffect(() => {
    // Runs even when modeId is null (unplayed set): post() resolves/creates the
    // mode, and a nameless player still needs the overlay.
    if (!enabled || score <= 0) return;
    let cancelled = false;
    (async () => {
      const uid = await getUserId();
      if (cancelled) return;
      const profile = uid ? await getProfile(uid).catch(() => null) : null;
      if (cancelled) return;
      const known = sanitizeName(profile?.displayName ?? localStorage.getItem(NAME_KEY) ?? '');
      if (!known) { setNeedsName(true); return; } // no name yet → onboarding overlay
      setName(known);
      await post(known);
    })().catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, modeId, score]);

  if (!enabled || score <= 0) return null;

  // Returns true once the score is posted. `override` lets the auto-post path
  // pass the resolved profile name without waiting for the name state to settle.
  async function post(override?: string): Promise<boolean> {
    const clean = sanitizeName(override ?? name);
    if (!clean) return false;
    setStatus('sending');
    setNameTaken(false);

    // Resolve the mode id — may need lazy creation for unplayed sets.
    let resolvedModeId = modeId;
    if (!resolvedModeId) {
      if (!modeFilter) {
        setStatus('error');
        return false;
      }
      const existing = await findExistingMode(modeFilter).catch(() => null);
      if (existing) {
        resolvedModeId = existing.id;
      } else {
        const created = await createMode(modeFilter).catch(() => null);
        if (!created || !created.ok) {
          setStatus('error');
          return false;
        }
        resolvedModeId = created.mode.id;
      }
    }

    const res = await submitScore({ name: clean, score, correct, cards, modeId: resolvedModeId, gameMode });
    if (!res.ok) {
      // Name already owned by another player — let them pick a different one.
      if (res.reason === 'name-taken') {
        setStatus('idle');
        setNameTaken(true);
        return false;
      }
      setStatus('error');
      return false;
    }
    localStorage.setItem(NAME_KEY, clean);
    const list = await fetchModeTopScores(resolvedModeId, VISIBLE).catch(() => []);
    setTop(list);
    setPosted({ rank: res.rank, id: res.id, name: clean });
    setStatus('done');
    setNeedsName(false);
    onPosted?.({ id: res.id, name: clean, rank: res.rank });
    return true;
  }

  // "Save & sync" from the onboarding overlay: post first (never lose the run),
  // then hand off to the profile to optionally add an email.
  async function postThenProfile() {
    const ok = await post();
    if (ok) onOpenProfile?.();
  }

  function changeName(v: string) {
    setName(v);
    if (nameTaken) setNameTaken(false);
  }

  // The online board for this mode, with the player's own row pinned below when
  // they'd land outside the visible top five (projected before posting; actual
  // rank after). Highlight the player's real row once posted and present.
  const youEntry: GlobalEntry = {
    id: posted?.id ?? 'projected',
    name: posted?.name ?? (sanitizeName(name) ?? 'You'),
    score,
    correct,
    gameModes: [gameMode],
    country: null,
    createdAt: Date.now(),
    deviceId: myId ?? 'projected',
  };
  const ownInTop = !!posted && top.some((e) => e.id === posted.id);
  const pinnedRank = posted?.rank ?? projected?.rank;
  const pinned =
    pinnedRank && pinnedRank > top.length && !ownInTop
      ? { rank: pinnedRank, entry: youEntry }
      : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 420 }}>
      {projected && status !== 'done' && (
        <div
          data-testid="projected-rank"
          style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--ink-2)', letterSpacing: 1 }}
        >
          You'd be ranked <span style={{ color: 'var(--ember-hot)' }}>#{projected.rank}</span> of {projected.total + 1}
        </div>
      )}

      {top.length > 0 && (
        <GlobalScoreList entries={top} highlightId={posted?.id} pinned={pinned} />
      )}

      {status === 'done' ? (
        <div data-testid="post-confirm" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <p style={{ flex: '1 1 80%', color: 'var(--ink-0)', fontSize: 13, textAlign: 'center', margin: 0 }}>
            Posted! You're ranked <span style={{ color: 'var(--ember-hot)' }}>#{posted?.rank}</span>.
          </p>
          {shareButton && <div style={{ flex: '0 0 20%', display: 'flex' }}>{shareButton}</div>}
        </div>
      ) : status === 'sending' && !needsName ? (
        <p data-testid="posting" style={{ textAlign: 'center', color: 'var(--ink-2)', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, margin: 0 }}>
          Posting…
        </p>
      ) : status === 'error' && !needsName ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="ember-btn" data-testid="post-error" style={{ flex: '1 1 80%', minWidth: 0 }} onClick={() => void post()}>
            Posting failed — retry
          </button>
          {shareButton && <div style={{ flex: '0 0 20%', display: 'flex' }}>{shareButton}</div>}
        </div>
      ) : null}

      {needsName && status !== 'done' && (
        <GameOverOnboard
          name={name}
          onNameChange={changeName}
          projected={projected}
          nameTaken={nameTaken}
          sending={status === 'sending'}
          error={status === 'error'}
          onSave={() => void post()}
          onSaveAndSync={() => void postThenProfile()}
        />
      )}
    </div>
  );
}
