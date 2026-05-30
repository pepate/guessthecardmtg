import { useEffect, useState } from 'react';
import type { CustomMode } from '../customModes/types';
import type { GlobalEntry } from '../leaderboard/types';
import { fetchModeTopScores } from '../leaderboard/client';
import { FilterChips } from './FilterChips';
import { GlobalScoreList } from './GlobalScoreList';

export function CustomModeDetail({ mode, existed, onBack, onPlay }: {
  mode: CustomMode;
  existed?: boolean;
  onBack: () => void;
  onPlay: (mode: CustomMode) => void;
}) {
  const [top, setTop] = useState<GlobalEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchModeTopScores(mode.id, 5)
      .then((list) => !cancelled && setTop(list))
      .catch(() => {});
    return () => { cancelled = true; };
  }, [mode.id]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 420, margin: '0 auto' }}>
      <h2 style={{ margin: 0, textAlign: 'center', color: 'var(--ink-0)', fontSize: 24 }}>{mode.name}</h2>
      {existed && (
        <p data-testid="existed-note" style={{ textAlign: 'center', color: 'var(--ink-2)', fontSize: 12, margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>
          This mode already existed — here it is.
        </p>
      )}
      <FilterChips filter={mode.filter} />
      <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--ink-2)' }}>
        {mode.card_count.toLocaleString()} cards in pool
      </div>

      {top.length > 0 ? (
        <GlobalScoreList entries={top} />
      ) : (
        <p style={{ textAlign: 'center', color: 'var(--ink-2)', fontSize: 13, margin: 0 }}>No scores yet — be the first.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button className="ember-btn" style={{ width: '100%' }} onClick={() => onPlay(mode)} data-testid="play-mode-btn">
          Play
        </button>
        <button className="ghost-btn" style={{ width: '100%' }} onClick={onBack}>Back</button>
      </div>
    </div>
  );
}
