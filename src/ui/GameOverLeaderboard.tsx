import { useEffect, useRef, useState } from 'react';
import type { PoolKind } from '../state/highscores';
import type { GlobalEntry } from '../leaderboard/types';
import type { RevealMode } from '../engine/timeAttack';
import { sanitizeName, NAME_MAX, NAME_MIN } from '../leaderboard/validation';
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
  gameMode,
}: {
  score: number;
  correct: number;
  pool: PoolKind;
  modeId?: string;
  modeName?: string;
  gameMode: RevealMode;
}) {
  const enabled = isLeaderboardEnabled();
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? '');
  const [projected, setProjected] = useState<{ rank: number; total: number } | null>(null);
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [posted, setPosted] = useState<{ rank: number; id: string; name: string } | null>(null);
  const [top, setTop] = useState<GlobalEntry[]>([]);
  const [nameError, setNameError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!enabled || score <= 0) return;
    let cancelled = false;
    const rankP = modeId ? fetchModeProjectedRank(modeId, score) : fetchProjectedRank(pool, score, gameMode);
    const topP = modeId ? fetchModeTopScores(modeId, VISIBLE) : fetchTopScores(pool, VISIBLE, null, gameMode);
    rankP.then((r) => !cancelled && setProjected(r)).catch(() => {});
    topP.then((list) => !cancelled && setTop(list)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled, pool, modeId, score, gameMode]);

  if (!enabled || score <= 0) return null;

  function nudgeName() {
    setNameError(true);
    const el = inputRef.current;
    el?.focus();
    el?.animate?.(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-6px)' },
        { transform: 'translateX(6px)' },
        { transform: 'translateX(-4px)' },
        { transform: 'translateX(4px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 380, easing: 'ease-in-out' },
    );
  }

  async function post() {
    const clean = sanitizeName(name);
    if (!clean) {
      nudgeName();
      return;
    }
    setStatus('sending');
    const res = await submitScore({ name: clean, score, correct, pool, modeId, gameMode });
    if (!res.ok) {
      setStatus('error');
      return;
    }
    localStorage.setItem(NAME_KEY, clean);
    const list = await (modeId ? fetchModeTopScores(modeId, VISIBLE) : fetchTopScores(pool, VISIBLE, null, gameMode)).catch(() => []);
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
    gameMode,
    country: null,
    createdAt: Date.now(),
  };
  const ownInTop = !!posted && top.some((e) => e.id === posted.id);
  const pinnedRank = posted?.rank ?? projected?.rank;
  const pinned =
    pinnedRank && pinnedRank > top.length && !ownInTop
      ? { rank: pinnedRank, entry: youEntry }
      : null;

  // When the player's row is pinned below the board, let them type their name
  // directly in that row instead of a separate field below the button.
  const showInlineInput = top.length > 0 && !!pinned && status !== 'done';

  function nameInput(inline: boolean) {
    const errorBorder = '1px solid var(--ember-hot)';
    return (
      <input
        ref={inputRef}
        data-testid="name-input"
        aria-invalid={nameError}
        value={name}
        maxLength={NAME_MAX}
        placeholder="Your name"
        onChange={(ev) => {
          setName(ev.target.value);
          if (nameError) setNameError(false);
        }}
        onKeyDown={(ev) => {
          if (ev.key === 'Enter' && status !== 'sending') void post();
        }}
        style={
          inline
            ? {
                width: '100%',
                minWidth: 0,
                boxSizing: 'border-box',
                padding: '3px 7px',
                borderRadius: 6,
                border: nameError ? errorBorder : '1px solid var(--ember)',
                background: 'rgba(0,0,0,0.28)',
                color: 'var(--ink-0)',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 14,
              }
            : {
                width: '100%',
                padding: '10px 12px',
                borderRadius: 10,
                border: nameError ? errorBorder : '1px solid var(--line-strong)',
                background: 'rgba(20,17,28,0.6)',
                color: 'var(--ink-0)',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 14,
              }
        }
      />
    );
  }

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
        <GlobalScoreList
          entries={top}
          highlightId={posted?.id}
          pinned={pinned}
          pinnedNameInput={showInlineInput ? nameInput(true) : undefined}
        />
      )}

      {status !== 'done' ? (
        <>
          {!showInlineInput && nameInput(false)}
          <button
            className="ember-btn"
            data-testid="post-btn"
            style={{ width: '100%' }}
            disabled={status === 'sending'}
            onClick={post}
          >
            {status === 'sending' ? 'Posting…' : 'Post to online board'}
          </button>
          {nameError && (
            <p data-testid="name-hint" style={{ color: 'var(--ember-hot)', fontSize: 12, textAlign: 'center', margin: 0 }}>
              Please enter your name (at least {NAME_MIN} characters).
            </p>
          )}
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
