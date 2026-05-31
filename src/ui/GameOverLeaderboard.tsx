import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { GlobalEntry } from '../leaderboard/types';
import type { RevealMode } from '../engine/timeAttack';
import { sanitizeName, NAME_MAX, NAME_MIN } from '../leaderboard/validation';
import {
  isLeaderboardEnabled,
  fetchModeProjectedRank,
  fetchModeTopScores,
  submitScore,
} from '../leaderboard/client';
import { getDeviceId } from '../leaderboard/identity';
import { findExistingMode, createMode } from '../modes/client';
import type { CustomFilter } from '../modes/filter';
import { GlobalScoreList } from './GlobalScoreList';

const NAME_KEY = 'guessthecard.playername';
const VISIBLE = 5;

export function GameOverLeaderboard({
  score,
  correct,
  modeId,
  modeFilter,
  gameMode,
  shareButton,
}: {
  score: number;
  correct: number;
  modeId: string | null;
  modeFilter?: CustomFilter;
  gameMode: RevealMode;
  shareButton?: ReactNode;
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

    // Resolve the mode id — may need lazy creation for unplayed sets.
    let resolvedModeId = modeId;
    if (!resolvedModeId) {
      if (!modeFilter) {
        setStatus('error');
        return;
      }
      const existing = await findExistingMode(modeFilter).catch(() => null);
      if (existing) {
        resolvedModeId = existing.id;
      } else {
        const created = await createMode(modeFilter).catch(() => null);
        if (!created || !created.ok) {
          setStatus('error');
          return;
        }
        resolvedModeId = created.mode.id;
      }
    }

    const res = await submitScore({ name: clean, score, correct, modeId: resolvedModeId, gameMode, deviceId: getDeviceId() });
    if (!res.ok) {
      setStatus('error');
      return;
    }
    localStorage.setItem(NAME_KEY, clean);
    const list = await fetchModeTopScores(resolvedModeId, VISIBLE).catch(() => []);
    setTop(list);
    setPosted({ rank: res.rank, id: res.id, name: clean });
    setStatus('done');
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
    deviceId: getDeviceId(),
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
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="ember-btn"
              data-testid="post-btn"
              style={{ flex: '1 1 80%', minWidth: 0 }}
              disabled={status === 'sending'}
              onClick={post}
            >
              {status === 'sending' ? 'Posting…' : 'Post to online board'}
            </button>
            {shareButton && <div style={{ flex: '0 0 20%', display: 'flex' }}>{shareButton}</div>}
          </div>
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
        <div data-testid="post-confirm" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <p style={{ flex: '1 1 80%', color: 'var(--ink-0)', fontSize: 13, textAlign: 'center', margin: 0 }}>
            Posted! You're ranked <span style={{ color: 'var(--ember-hot)' }}>#{posted?.rank}</span>.
          </p>
          {shareButton && <div style={{ flex: '0 0 20%', display: 'flex' }}>{shareButton}</div>}
        </div>
      )}
    </div>
  );
}
