import type { Profile } from '../profile/client';
import type { PlayerBest } from '../profile/stats';
import { REVEAL_MODE_LABELS } from '../reveal/labels';
import { ScoreValue } from './ScoreValue';

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--ink-2)',
  letterSpacing: 1.2,
  textTransform: 'uppercase',
  margin: 0,
};

function StatLine({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 15, color: 'var(--ink-1)' }}>
      <span>{label}</span>
      <strong style={{ color: 'var(--ink-0)', fontSize: 16 }}>{value}</strong>
    </div>
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
        gap: 14,
        background: 'rgba(20,17,28,0.6)',
        borderRadius: 12,
        padding: '14px 16px',
        border: '1px solid var(--line-strong)',
      }}
    >
      <p style={labelStyle}>Statistics</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <StatLine label="Games played" value={profile.gamesPlayed} />
        <StatLine label="Correct guesses" value={profile.totalCorrect} />
        <StatLine label="Hit rate" value={hitRate} />
        <StatLine label="Avg correct / game" value={avgCorrect} />
      </div>

      {bests.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={labelStyle}>Personal bests</p>
          {bests.map((b) => (
            <div
              key={b.modeId}
              data-testid="profile-best"
              style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: "'JetBrains Mono', monospace", fontSize: 14 }}
            >
              <span style={{ flex: 1, minWidth: 0, color: 'var(--ink-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {b.modeName}
              </span>
              {b.reveal && <span style={{ color: 'var(--ink-2)', fontSize: 13 }}>{REVEAL_MODE_LABELS[b.reveal]}</span>}
              <ScoreValue score={b.bestScore} fontSize={14} />
              <span
                style={{
                  flex: '0 0 auto',
                  minWidth: 34,
                  textAlign: 'right',
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
