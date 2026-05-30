import { motion } from 'framer-motion';
import { Leaderboard } from './Leaderboard';
import { useGameStore } from '../state/gameStore';
import type { RevealMode } from '../engine/timeAttack';

export function StartLeaderboard({ refreshKey = 0 }: { refreshKey?: number }) {
  function handlePlayMode(mode: RevealMode, kind: 'all' | 'popular') {
    const store = useGameStore.getState();
    store.setRevealChoice(mode);
    void store.selectPool({ kind, excludeUniverseBeyond: true });
  }

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
      <Leaderboard refreshKey={refreshKey} onPlayMode={handlePlayMode} />
    </motion.div>
  );
}
