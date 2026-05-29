import { motion } from 'framer-motion';
import { useGameStore } from '../state/gameStore';

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

export function HUD() {
  const totalScore = useGameStore((s) => s.totalScore);
  const streak = useGameStore((s) => s.streak);

  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        gap: 10,
        padding: '12px 16px',
        paddingTop: 'calc(12px + env(safe-area-inset-top))',
      }}
    >
      <div style={chip}>
        <span style={label}>SCORE</span>
        <span style={{ color: 'var(--ink-0)', fontSize: 20, fontWeight: 700 }}>{totalScore}</span>
      </div>
      {streak > 0 && (
        <div style={chip}>
          <span style={label}>STREAK</span>
          <span style={{ color: 'var(--ember-hot)', fontSize: 20, fontWeight: 700 }}>{streak}</span>
        </div>
      )}
    </motion.div>
  );
}
