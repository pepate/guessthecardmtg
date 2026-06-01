import type { DailyToday } from '../daily/client';
import { ScoreValue } from './ScoreValue';
import { countryToFlag } from '../leaderboard/flag';

export function DailySetButton({ daily, onOpen }: { daily: DailyToday | null; onOpen: () => void }) {
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
      {/* Right column: leader name + points. */}
      {daily?.leader && (
        <span style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink-2)', fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
          <span aria-hidden>{countryToFlag(daily.leader.country)}</span>
          <span style={{ maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{daily.leader.name}</span>
          <ScoreValue score={daily.leader.score} fontSize={13} />
        </span>
      )}
    </button>
  );
}
