import { useState } from 'react';
import type { PoolKind } from '../state/highscores';
import { loadHighscores } from '../state/highscores';
import { useLeaderboard } from '../leaderboard/useLeaderboard';
import { GlobalScoreList } from './GlobalScoreList';
import { HighscoreList } from './HighscoreList';

type Tab = 'all' | 'popular' | 'me';

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All Cards' },
  { key: 'popular', label: 'Popular' },
  { key: 'me', label: 'Me' },
];

function GlobalTab({ pool }: { pool: PoolKind }) {
  const [expanded, setExpanded] = useState(false);
  const { entries, loading, error } = useLeaderboard(pool, expanded ? 100 : 5);

  if (error) {
    return <p style={{ color: 'var(--ember-hot)', fontSize: 13, textAlign: 'center' }}>Leaderboard nicht erreichbar.</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <GlobalScoreList entries={entries} />
      {!expanded && entries.length >= 1 && (
        <button
          className="ghost-btn"
          data-testid="leaderboard-expand"
          style={{ width: '100%' }}
          onClick={() => setExpanded(true)}
          disabled={loading}
        >
          Mehr anzeigen
        </button>
      )}
    </div>
  );
}

export function Leaderboard() {
  const [tab, setTab] = useState<Tab>('all');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', maxWidth: 420 }}>
      <div role="tablist" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={tab === t.key ? 'ember-btn' : 'ghost-btn'}
            style={{ padding: '8px 4px', fontSize: 12 }}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'all' && <GlobalTab pool="all" />}
      {tab === 'popular' && <GlobalTab pool="popular" />}
      {tab === 'me' && <HighscoreList entries={loadHighscores()} />}
    </div>
  );
}
