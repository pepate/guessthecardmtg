import { motion } from 'framer-motion';
import { useGameStore } from '../state/gameStore';

export function HUD() {
  const totalScore = useGameStore((s) => s.totalScore);
  const streak = useGameStore((s) => s.streak);

  const chip: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    background: 'rgba(0,0,0,0.45)',
    backdropFilter: 'blur(8px)',
    borderRadius: 10,
    padding: '6px 16px',
    minWidth: 72,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
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
        <span style={{ color: '#aaa', fontSize: 11, fontWeight: 600, letterSpacing: 0.5 }}>
          SCORE
        </span>
        <span style={{ color: '#fff', fontSize: 20, fontWeight: 700 }}>{totalScore}</span>
      </div>
      {streak > 0 && (
        <div style={chip}>
          <span style={{ color: '#aaa', fontSize: 11, fontWeight: 600, letterSpacing: 0.5 }}>
            STREAK
          </span>
          <span style={{ color: '#f90', fontSize: 20, fontWeight: 700 }}>{streak}</span>
        </div>
      )}
    </motion.div>
  );
}
