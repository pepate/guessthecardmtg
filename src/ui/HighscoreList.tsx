import type { HighscoreEntry } from '../state/highscores';

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
        Noch keine Spiele — los geht's!
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
        <span>TREFFER</span>
        <span>PUNKTE</span>
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
            <span style={{ color: 'var(--ink-0)', fontSize: 14 }}>
              {e.correct}/{e.total}
            </span>
            <span style={{ color: 'var(--ember-hot)', fontSize: 15, fontWeight: 700 }}>{e.score}</span>
          </div>
        );
      })}
    </div>
  );
}
