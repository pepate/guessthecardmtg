import { motion } from 'framer-motion';
import { useGameStore } from '../state/gameStore';
import { useCountUp } from './useCountUp';
import { REVEAL_MODE_LABELS } from '../reveal/labels';

const chip: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  background: 'rgba(13,11,19,0.55)',
  border: '1px solid var(--line)',
  backdropFilter: 'blur(8px)',
  borderRadius: 10,
  padding: '6px 16px',
  minWidth: 72,
};

const label: React.CSSProperties = {
  color: 'var(--ink-2)',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: 1.5,
  fontFamily: "'JetBrains Mono', monospace",
};

export function HUD({ timeLeftMs }: { timeLeftMs: number }) {
  const totalScore = useGameStore((s) => s.totalScore);
  const correctCount = useGameStore((s) => s.correctCount);
  const modeName = useGameStore((s) => s.currentModeName);
  const gameMode = useGameStore((s) => s.gameMode);

  const animatedScore = useCountUp(totalScore, 900);
  const seconds = Math.max(0, Math.ceil(timeLeftMs / 1000));
  const low = seconds <= 10;

  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '12px 16px',
        paddingTop: 'calc(12px + env(safe-area-inset-top))',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <div style={chip}>
          <span style={label}>TIME</span>
          <span
            data-testid="game-time"
            style={{ color: low ? 'var(--ember-hot)' : 'var(--ink-0)', fontSize: 20, fontWeight: 700, transition: 'color 0.3s ease' }}
          >
            {seconds}s
          </span>
        </div>
        <div style={chip}>
          <span style={label}>CORRECT</span>
          <span data-testid="round-progress" style={{ color: 'var(--ink-0)', fontSize: 20, fontWeight: 700 }}>
            {correctCount}
          </span>
        </div>
        <div style={chip}>
          <span style={label}>SCORE</span>
          <span data-testid="hud-score" style={{ color: 'var(--ink-0)', fontSize: 20, fontWeight: 700 }}>
            {animatedScore}
          </span>
        </div>
      </div>

      {modeName && (
        <div
          data-testid="hud-mode"
          style={{
            textAlign: 'center',
            color: 'var(--ink-1)',
            fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 700,
            // Shrinks on narrow screens so the title + reveal mode always fits.
            fontSize: 'clamp(13px, 4vw, 18px)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            textShadow: '0 1px 10px rgba(0,0,0,0.75)',
          }}
        >
          {modeName} · {REVEAL_MODE_LABELS[gameMode]}
        </div>
      )}
    </motion.div>
  );
}
