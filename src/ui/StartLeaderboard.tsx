import { motion } from 'framer-motion';
import { Leaderboard } from './Leaderboard';

export function StartLeaderboard() {
  return (
    <motion.div
      data-testid="start-leaderboard"
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: '100%' }}
    >
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: 2,
          textTransform: 'uppercase',
          fontSize: 12,
          color: 'var(--ink-2)',
        }}
      >
        Leaderboard
      </span>
      <Leaderboard />
    </motion.div>
  );
}
