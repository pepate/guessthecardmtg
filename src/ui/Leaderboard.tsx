import { useEffect, useState } from 'react';
import { loadHighscores } from '../state/highscores';
import { useLeaderboard } from '../leaderboard/useLeaderboard';
import { WINDOW_TABS, type TimeWindow } from '../leaderboard/window';
import { GlobalScoreList } from './GlobalScoreList';
import { HighscoreList } from './HighscoreList';

type Tab = 'all' | 'popular' | 'me';

// Collapsed view shows up to VISIBLE rows; we fetch one extra so we can tell
// whether a "Show more" button is warranted (i.e. there are more than VISIBLE).
const VISIBLE = 10;
const PROBE = VISIBLE + 1;

function GlobalView({
  state,
  expanded,
  onExpand,
}: {
  state: ReturnType<typeof useLeaderboard>;
  expanded: boolean;
  onExpand: () => void;
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
      <GlobalScoreList entries={visible} />
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

export function Leaderboard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [tab, setTab] = useState<Tab>('all');
  const [win, setWin] = useState<TimeWindow>('today');
  const [allExpanded, setAllExpanded] = useState(false);
  const [popExpanded, setPopExpanded] = useState(false);

  const all = useLeaderboard('all', allExpanded ? 100 : PROBE, win, refreshKey);
  const popular = useLeaderboard('popular', popExpanded ? 100 : PROBE, win, refreshKey);
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

      {tab === 'all' && <GlobalView state={all} expanded={allExpanded} onExpand={() => setAllExpanded(true)} />}
      {tab === 'popular' && <GlobalView state={popular} expanded={popExpanded} onExpand={() => setPopExpanded(true)} />}
      {tab === 'me' && <HighscoreList entries={mine} />}
    </div>
  );
}
