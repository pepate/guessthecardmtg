import { useEffect, useState } from 'react';
import type { DailyToday } from '../daily/client';
import { ScoreValue } from './ScoreValue';
import { countryToFlag } from '../leaderboard/flag';

/** Milliseconds until the next Europe/Berlin midnight (when the daily set rolls over). */
function msUntilBerlinMidnight(): number {
  const berlinNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
  const next = new Date(berlinNow);
  next.setHours(24, 0, 0, 0);
  return Math.max(0, next.getTime() - berlinNow.getTime());
}

function formatRemaining(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

export function DailySetButton({ daily, onOpen, topArts = [] }: { daily: DailyToday | null; onOpen: () => void; topArts?: string[] }) {
  const [remaining, setRemaining] = useState(msUntilBerlinMidnight);
  useEffect(() => {
    const id = setInterval(() => setRemaining(msUntilBerlinMidnight()), 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <button
      type="button"
      data-testid="daily-set-btn"
      onClick={onOpen}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
        padding: '10px 14px', borderRadius: 12, border: '1px solid var(--ember)',
        background: 'rgba(255,138,60,0.12)', cursor: 'pointer',
      }}
    >
      {/* Left column: set name on top, "Daily Set" beneath. */}
      <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ color: 'var(--ink-0)', fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {daily?.setName ?? 'Daily Set'}
        </span>
        {daily?.setName && (
          <span style={{ color: 'var(--ember-hot)', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>
            Daily Set
          </span>
        )}
      </span>
      {/* Right column: the leader (once someone has posted) or — while the board
          is still empty — a strip of the set's top-EDHRec artworks for colour,
          with the time left beneath either way. */}
      {daily && (
        <span style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          {daily.leader ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink-2)', fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
              <span aria-hidden>{countryToFlag(daily.leader.country)}</span>
              <span style={{ maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{daily.leader.name}</span>
              <ScoreValue score={daily.leader.score} fontSize={13} />
            </span>
          ) : topArts.length > 0 ? (
            <span data-testid="daily-arts" aria-hidden style={{ display: 'flex', gap: 4 }}>
              {topArts.map((art, i) => (
                <span
                  key={i}
                  style={{
                    width: 34, height: 34, borderRadius: 7, flexShrink: 0,
                    border: '1px solid var(--ember-deep)',
                    background: `center / cover no-repeat url(${art})`,
                  }}
                />
              ))}
            </span>
          ) : null}
          <span
            data-testid="daily-timer"
            style={{
              color: 'var(--ink-1)', fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              background: 'rgba(7,6,10,0.6)', padding: '1px 6px', borderRadius: 6, whiteSpace: 'nowrap',
            }}
          >
            {formatRemaining(remaining)}
          </span>
        </span>
      )}
    </button>
  );
}
