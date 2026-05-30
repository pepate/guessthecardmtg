import { useEffect, useState } from 'react';
import { loadHighscores } from '../state/highscores';
import { useLeaderboard } from '../leaderboard/useLeaderboard';
import { WINDOW_TABS, type TimeWindow } from '../leaderboard/window';
import { GlobalScoreList } from './GlobalScoreList';
import { HighscoreList } from './HighscoreList';
import { getBuiltinModes } from '../modes/client';
import type { CustomMode } from '../modes/types';
import type { RevealMode } from '../engine/timeAttack';

type Tab = 'all' | 'popular' | 'me';

// Collapsed view shows up to VISIBLE rows; we fetch one extra so we can tell
// whether a "Show more" button is warranted (i.e. there are more than VISIBLE).
const VISIBLE = 10;
const PROBE = VISIBLE + 1;

// Sentinel used while builtin mode ids are loading.
const LOADING_ID = '';

function GlobalView({
  state,
  expanded,
  onExpand,
  onPlayMode,
  poolKind,
}: {
  state: ReturnType<typeof useLeaderboard>;
  expanded: boolean;
  onExpand: () => void;
  onPlayMode?: (mode: RevealMode, kind: 'all' | 'popular') => void;
  poolKind: 'all' | 'popular';
}) {
  if (state.error) {
    return <p style={{ color: 'var(--ember-hot)', fontSize: 13, textAlign: 'center' }}>Leaderboard unavailable.</p>;
  }
  if (state.loading && state.entries.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0' }}>
        <span className="spinner" data-testid="leaderboard-spinner" aria-label="Loading" />
      </div>
    );
  }
  const visible = expanded ? state.entries : state.entries.slice(0, VISIBLE);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <GlobalScoreList entries={visible} onPlayMode={onPlayMode ? (mode) => onPlayMode(mode, poolKind) : undefined} />
      {!expanded && state.entries.length > VISIBLE && (
        <button
          className="ghost-btn"
          data-testid="leaderboard-expand"
          style={{ width: '100%' }}
          onClick={onExpand}
          disabled={state.loading}
        >
          Show more
        </button>
      )}
    </div>
  );
}

export function Leaderboard({ refreshKey = 0, onPlayMode }: { refreshKey?: number; onPlayMode?: (mode: RevealMode, kind: 'all' | 'popular') => void }) {
  const [tab, setTab] = useState<Tab>('all');
  const [win, setWin] = useState<TimeWindow>('today');
  const [allExpanded, setAllExpanded] = useState(false);
  const [popExpanded, setPopExpanded] = useState(false);
  const [builtins, setBuiltins] = useState<{ all: CustomMode; popular: CustomMode } | null>(null);
  const [builtinsError, setBuiltinsError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getBuiltinModes()
      .then((b) => { if (!cancelled && b) setBuiltins(b); })
      .catch(() => { if (!cancelled) setBuiltinsError(true); });
    return () => { cancelled = true; };
  }, []);

  const allModeId = builtins?.all.id ?? LOADING_ID;
  const popularModeId = builtins?.popular.id ?? LOADING_ID;

  const all = useLeaderboard(allModeId, allExpanded ? 100 : PROBE, win, refreshKey);
  const popular = useLeaderboard(popularModeId, popExpanded ? 100 : PROBE, win, refreshKey);
  const mine = loadHighscores();

  const showPopular = popular.entries.length >= 1;
  const showMe = mine.length >= 1;

  // If the active tab loses its data (or never had any), fall back to All Cards.
  useEffect(() => {
    if (tab === 'popular' && !showPopular) setTab('all');
    if (tab === 'me' && !showMe) setTab('all');
  }, [tab, showPopular, showMe]);

  const tabs: { key: Tab; label: string }[] = [{ key: 'all', label: 'All Cards' }];
  if (showPopular) tabs.push({ key: 'popular', label: 'Popular' });
  if (showMe) tabs.push({ key: 'me', label: 'Me' });

  if (builtinsError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', maxWidth: 420 }}>
        <p style={{ color: 'var(--ember-hot)', fontSize: 13, textAlign: 'center' }}>Leaderboard unavailable.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', maxWidth: 420 }}>
      <div
        role="tablist"
        style={{
          display: 'flex',
          gap: 4,
          padding: 4,
          borderRadius: 10,
          border: '1px solid var(--line)',
          background: 'rgba(20,17,28,0.5)',
        }}
      >
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              style={{
                flex: 1,
                padding: '6px 8px',
                borderRadius: 7,
                border: 'none',
                cursor: 'pointer',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                background: active ? 'var(--ember)' : 'transparent',
                color: active ? '#fff' : 'var(--ink-2)',
                fontWeight: active ? 700 : 500,
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab !== 'me' && (
        <div
          role="tablist"
          aria-label="Time window"
          style={{
            display: 'flex',
            gap: 4,
            padding: 4,
            borderRadius: 10,
            border: '1px solid var(--line)',
            background: 'rgba(20,17,28,0.5)',
          }}
        >
          {WINDOW_TABS.map((w) => {
            const active = win === w.key;
            return (
              <button
                key={w.key}
                role="tab"
                aria-selected={active}
                onClick={() => setWin(w.key)}
                style={{
                  flex: 1,
                  padding: '5px 8px',
                  borderRadius: 7,
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                  background: active ? 'rgba(255,122,44,0.22)' : 'transparent',
                  color: active ? 'var(--ember-hot)' : 'var(--ink-2)',
                  fontWeight: active ? 700 : 500,
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {w.label}
              </button>
            );
          })}
        </div>
      )}

      {tab === 'all' && <GlobalView state={all} expanded={allExpanded} onExpand={() => setAllExpanded(true)} onPlayMode={onPlayMode} poolKind="all" />}
      {tab === 'popular' && <GlobalView state={popular} expanded={popExpanded} onExpand={() => setPopExpanded(true)} onPlayMode={onPlayMode} poolKind="popular" />}
      {tab === 'me' && <HighscoreList entries={mine} />}
    </div>
  );
}
