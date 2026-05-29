import { useGameStore } from '../state/gameStore';
import { scoreAt } from '../engine/timeAttack';

export function Timer({ elapsedMs }: { elapsedMs: number }) {
  const config = useGameStore((s) => s.config);

  const remainingMs = Math.max(0, config.durationMs - elapsedMs);
  const seconds = Math.ceil(remainingMs / 1000);
  const frac = Math.min(1, elapsedMs / config.durationMs);
  const score = scoreAt(elapsedMs, config);

  const low = seconds <= 5;
  const barColor = low ? 'var(--ember-hot)' : 'var(--ember)';

  return (
    <div
      data-testid="timer"
      data-seconds={seconds}
      style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 4px' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 28,
            fontWeight: 600,
            color: low ? 'var(--ember-hot)' : 'var(--ink-0)',
            letterSpacing: 1,
            transition: 'color 0.3s ease',
          }}
        >
          {seconds}s
        </span>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 15,
            color: 'var(--ink-2)',
            letterSpacing: 0.5,
          }}
        >
          <span data-testid="live-score" style={{ color: 'var(--ember-hot)', fontWeight: 600 }}>
            {score}
          </span>{' '}
          pts
        </span>
      </div>
      <div
        style={{
          height: 5,
          borderRadius: 4,
          background: 'rgba(255,186,120,0.10)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${(1 - frac) * 100}%`,
            background: barColor,
            boxShadow: `0 0 10px ${barColor}`,
            transition: 'width 0.12s linear, background 0.3s ease',
          }}
        />
      </div>
    </div>
  );
}
