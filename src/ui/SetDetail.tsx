import { useEffect, useState } from 'react';
import { useGameStore } from '../state/gameStore';
import { fetchModeTopScores } from '../leaderboard/client';
import { GlobalScoreList } from './GlobalScoreList';
import type { SetListItem } from '../sets/client';
import type { GlobalEntry } from '../leaderboard/types';

function setYear(releasedAt: string | null): string {
  if (!releasedAt) return '';
  return new Date(releasedAt).getUTCFullYear().toString();
}

export function SetDetail({ set, onBack }: { set: SetListItem; onBack: () => void }) {
  const [top, setTop] = useState<GlobalEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!set.modeId) return;
    let cancelled = false;
    setLoading(true);
    fetchModeTopScores(set.modeId, 8)
      .then((list) => { if (!cancelled) setTop(list); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [set.modeId]);

  function play() {
    useGameStore.getState().selectPool({ kind: 'set', code: set.code, name: set.name, modeId: set.modeId });
  }

  const year = setYear(set.releasedAt);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 420, margin: '0 auto' }}>
      <h2 style={{ margin: 0, textAlign: 'center', color: 'var(--ink-0)', fontSize: 22 }}>
        {set.name}
        {year && <span style={{ color: 'var(--ink-2)', fontSize: 15, marginLeft: 8 }}>{year}</span>}
      </h2>

      <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--ink-2)' }}>
        {set.eligibleCount.toLocaleString()} cards in pool
      </div>

      {set.modeId ? (
        loading ? (
          <div style={{ textAlign: 'center', color: 'var(--ink-2)' }}><span className="spinner" /></div>
        ) : (
          <GlobalScoreList entries={top} />
        )
      ) : (
        <p style={{ textAlign: 'center', color: 'var(--ink-2)', fontSize: 13, margin: 0 }}>
          No scores yet — be the first.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button className="ember-btn" style={{ width: '100%' }} onClick={play} data-testid="set-play-btn">
          Play
        </button>
        <button className="ghost-btn" style={{ width: '100%' }} onClick={onBack}>Back</button>
      </div>
    </div>
  );
}
