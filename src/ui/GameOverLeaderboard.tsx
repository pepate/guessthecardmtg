import { useEffect, useState } from 'react';
import type { PoolKind } from '../state/highscores';
import type { GlobalEntry } from '../leaderboard/types';
import { sanitizeName, NAME_MAX } from '../leaderboard/validation';
import {
  isLeaderboardEnabled,
  fetchProjectedRank,
  fetchTopScores,
  fetchModeProjectedRank,
  fetchModeTopScores,
  submitScore,
} from '../leaderboard/client';
import { GlobalScoreList } from './GlobalScoreList';

const NAME_KEY = 'guessthecard.playername';
const VISIBLE = 5;

export function GameOverLeaderboard({
  score,
  correct,
  pool,
  modeId,
  modeName,
}: {
  score: number;
  correct: number;
  pool: PoolKind;
  modeId?: string;
  modeName?: string;
}) {
  const enabled = isLeaderboardEnabled();
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? '');
  const [projected, setProjected] = useState<{ rank: number; total: number } | null>(null);
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [posted, setPosted] = useState<{ rank: number; id: string; name: string } | null>(null);
  const [top, setTop] = useState<GlobalEntry[]>([]);

  useEffect(() => {
    if (!enabled || score <= 0) return;
    let cancelled = false;
    const rankP = modeId ? fetchModeProjectedRank(modeId, score) : fetchProjectedRank(pool, score);
    const topP = modeId ? fetchModeTopScores(modeId, VISIBLE) : fetchTopScores(pool, VISIBLE);
    rankP.then((r) => !cancelled && setProjected(r)).catch(() => {});
    topP.then((list) => !cancelled && setTop(list)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled, pool, modeId, score]);

  if (!enabled || score <= 0) return null;

  const valid = sanitizeName(name) !== null;

  async function post() {
    const clean = sanitizeName(name);
    if (!clean) return;
    setStatus('sending');
    const res = await submitScore({ name: clean, score, correct, pool, modeId });
    if (!res.ok) {
      setStatus('error');
      return;
    }
    localStorage.setItem(NAME_KEY, clean);
    const list = await (modeId ? fetchModeTopScores(modeId, VISIBLE) : fetchTopScores(pool, VISIBLE)).catch(() => []);
    setTop(list);
    setPosted({ rank: res.rank, id: res.id, name: clean });
    setStatus('done');
  }

  // The online board for this pool, with the player's own row pinned below when
  // they'd land outside the visible top five (projected before posting; actual
  // rank after). Highlight the player's real row once posted and present.
  const youEntry: GlobalEntry = {
    id: posted?.id ?? 'projected',
    name: posted?.name ?? (sanitizeName(name) ?? 'You'),
    score,
    correct,
    pool,
    country: null,
    createdAt: Date.now(),
  };
  const ownInTop = !!posted && top.some((e) => e.id === posted.id);
  const pinnedRank = posted?.rank ?? projected?.rank;
  const pinned =
    pinnedRank && pinnedRank > top.length && !ownInTop
      ? { rank: pinnedRank, entry: youEntry }
      : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 420 }}>
      {modeName && (
        <div
          data-testid="mode-board-title"
          style={{ textAlign: 'center', color: 'var(--ink-1)', fontSize: 14, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}
        >
          {modeName}
        </div>
      )}
      {projected && (
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

      {status !== 'done' ? (
        <>
          <input
            data-testid="name-input"
            value={name}
            maxLength={NAME_MAX}
            placeholder="Your name"
            onChange={(ev) => setName(ev.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid var(--line-strong)',
              background: 'rgba(20,17,28,0.6)',
              color: 'var(--ink-0)',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 14,
            }}
          />
          <button
            className="ember-btn"
            data-testid="post-btn"
            style={{ width: '100%' }}
            disabled={!valid || status === 'sending'}
            onClick={post}
          >
            {status === 'sending' ? 'Posting…' : 'Post to online board'}
          </button>
          {status === 'error' && (
            <p data-testid="post-error" style={{ color: 'var(--ember-hot)', fontSize: 12, textAlign: 'center', margin: 0 }}>
              Posting failed — please try again.
            </p>
          )}
        </>
      ) : (
        <div data-testid="post-confirm" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ color: 'var(--ink-0)', fontSize: 13, textAlign: 'center', margin: 0 }}>
            Posted! You're ranked <span style={{ color: 'var(--ember-hot)' }}>#{posted?.rank}</span>.
          </p>
        </div>
      )}
    </div>
  );
}
