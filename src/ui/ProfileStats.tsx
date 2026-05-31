import type { Profile } from '../profile/client';
import type { PlayerBest } from '../profile/stats';
import { REVEAL_MODE_LABELS } from '../reveal/labels';
import { ScoreValue } from './ScoreValue';

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--ink-2)',
  letterSpacing: 1,
  textTransform: 'uppercase',
  margin: 0,
};

function StatLine({ label, value }: { label: string; value: string | number }) {
  return (
    <span style={{ fontSize: 13, color: 'var(--ink-1)' }}>
      {label}: <strong style={{ color: 'var(--ink-0)' }}>{value}</strong>
    </span>
  );
}

export function ProfileStats({ profile, bests }: { profile: Profile | null; bests: PlayerBest[] }) {
  if (!profile) return null;
  const hitRate = profile.totalCards > 0 ? `${Math.round((100 * profile.totalCorrect) / profile.totalCards)}%` : '—';
  const avgCorrect = profile.gamesPlayed > 0 ? (profile.totalCorrect / profile.gamesPlayed).toFixed(1) : '—';

  return (
    <div
      data-testid="profile-stats"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        background: 'rgba(20,17,28,0.6)',
        borderRadius: 10,
        padding: '12px 14px',
        border: '1px solid var(--line-strong)',
      }}
    >
      <p style={labelStyle}>Statistics</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <StatLine label="Games played" value={profile.gamesPlayed} />
        <StatLine label="Correct guesses" value={profile.totalCorrect} />
        <StatLine label="Hit rate" value={hitRate} />
        <StatLine label="Avg correct / game" value={avgCorrect} />
      </div>

      {bests.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p style={labelStyle}>Personal bests</p>
          {bests.map((b) => (
            <div
              key={b.modeId}
              data-testid="profile-best"
              style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}
            >
              <span style={{ flex: 1, minWidth: 0, color: 'var(--ink-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {b.modeName}
              </span>
              {b.reveal && <span style={{ color: 'var(--ink-2)' }}>{REVEAL_MODE_LABELS[b.reveal]}</span>}
              <ScoreValue score={b.bestScore} fontSize={12} />
              <span
                style={{
                  flex: '0 0 auto',
                  minWidth: 30,
                  textAlign: 'center',
                  color: b.rank === 1 ? 'var(--ember-hot)' : 'var(--ink-1)',
                  fontWeight: 700,
                }}
              >
                {b.rank ? `#${b.rank}` : '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
