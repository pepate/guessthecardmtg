import { useEffect, useState } from 'react';
import type { PoolKind } from '../state/highscores';
import type { GlobalEntry } from '../leaderboard/types';
import { sanitizeName, NAME_MAX } from '../leaderboard/validation';
import {
  isLeaderboardEnabled,
  fetchProjectedRank,
  fetchTopScores,
  submitScore,
} from '../leaderboard/client';
import { GlobalScoreList } from './GlobalScoreList';

const NAME_KEY = 'guessthecard.playername';
const VISIBLE = 5;

export function GameOverLeaderboard({
  score,
  correct,
  pool,
}: {
  score: number;
  correct: number;
  pool: PoolKind;
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
    fetchProjectedRank(pool, score)
      .then((r) => !cancelled && setProjected(r))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled, pool, score]);

  if (!enabled || score <= 0) return null;

  const valid = sanitizeName(name) !== null;

  async function post() {
    const clean = sanitizeName(name);
    if (!clean) return;
    setStatus('sending');
    const res = await submitScore({ name: clean, score, correct, pool });
    if (!res.ok) {
      setStatus('error');
      return;
    }
    localStorage.setItem(NAME_KEY, clean);
    const list = await fetchTopScores(pool, VISIBLE).catch(() => []);
    setTop(list);
    setPosted({ rank: res.rank, id: res.id, name: clean });
    setStatus('done');
  }

  const ownInTop = posted && top.some((e) => e.id === posted.id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 420 }}>
      {projected && (
        <div
          data-testid="projected-rank"
          style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--ink-2)', letterSpacing: 1 }}
        >
          Du wärst auf Platz <span style={{ color: 'var(--ember-hot)' }}>#{projected.rank}</span> von {projected.total + 1}
        </div>
      )}

      {status !== 'done' ? (
        <>
          <input
            data-testid="name-input"
            value={name}
            maxLength={NAME_MAX}
            placeholder="Dein Name"
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
            {status === 'sending' ? 'Wird gepostet…' : 'Aufs Online-Board posten'}
          </button>
          {status === 'error' && (
            <p data-testid="post-error" style={{ color: 'var(--ember-hot)', fontSize: 12, textAlign: 'center', margin: 0 }}>
              Posten fehlgeschlagen — bitte erneut versuchen.
            </p>
          )}
        </>
      ) : (
        <div data-testid="post-confirm" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ color: 'var(--ink-0)', fontSize: 13, textAlign: 'center', margin: 0 }}>
            Gepostet! Du bist auf Platz <span style={{ color: 'var(--ember-hot)' }}>#{posted?.rank}</span>.
          </p>
          <GlobalBoardPreview
            top={top}
            posted={posted}
            ownInTop={!!ownInTop}
            score={score}
            correct={correct}
            pool={pool}
          />
        </div>
      )}
    </div>
  );
}

function GlobalBoardPreview({
  top,
  posted,
  ownInTop,
  score,
  correct,
  pool,
}: {
  top: GlobalEntry[];
  posted: { rank: number; id: string; name: string } | null;
  ownInTop: boolean;
  score: number;
  correct: number;
  pool: PoolKind;
}) {
  const pinned =
    posted && !ownInTop
      ? {
          rank: posted.rank,
          entry: {
            id: posted.id,
            name: posted.name,
            score,
            correct,
            pool,
            country: null,
            createdAt: Date.now(),
          } satisfies GlobalEntry,
        }
      : null;
  return <GlobalScoreList entries={top} highlightId={posted?.id} pinned={pinned} />;
}
