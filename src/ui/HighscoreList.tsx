import type { HighscoreEntry } from '../state/highscores';
import { ScoreValue } from './ScoreValue';

export function HighscoreList({
  entries,
  highlight,
}: {
  entries: HighscoreEntry[];
  highlight?: (e: HighscoreEntry) => boolean;
}) {
  if (entries.length === 0) {
    return (
      <p
        data-testid="highscore-empty"
        style={{ color: 'var(--ink-2)', fontSize: 13, textAlign: 'center', margin: 0 }}
      >
        No games yet — get started!
      </p>
    );
  }

  return (
    <div data-testid="highscore-list" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '24px 1fr auto',
          gap: 10,
          padding: '0 10px 4px',
          color: 'var(--ink-2)',
          fontSize: 10,
          letterSpacing: 1.5,
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        <span>#</span>
        <span>CORRECT</span>
        <span>SCORE</span>
      </div>
      {entries.map((e, i) => {
        const on = highlight?.(e) ?? false;
        return (
          <div
            key={`${e.date}-${i}`}
            data-testid="highscore-entry"
            style={{
              display: 'grid',
              gridTemplateColumns: '24px 1fr auto',
              gap: 10,
              alignItems: 'center',
              padding: '8px 10px',
              borderRadius: 8,
              background: on ? 'rgba(255,138,60,0.18)' : 'rgba(20,17,28,0.5)',
              border: `1px solid ${on ? 'var(--ember)' : 'var(--line)'}`,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            <span style={{ color: 'var(--ink-2)', fontSize: 13 }}>{i + 1}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span style={{ color: 'var(--ink-0)', fontSize: 14 }}>{e.correct}</span>
              <span
                style={{
                  fontSize: 9,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  color: 'var(--ink-2)',
                  border: '1px solid var(--line)',
                  borderRadius: 4,
                  padding: '1px 5px',
                  whiteSpace: 'nowrap',
                }}
              >
                {e.pool === 'all' ? 'All' : 'Popular'}
              </span>
            </span>
            <ScoreValue score={e.score} />
          </div>
        );
      })}
    </div>
  );
}
