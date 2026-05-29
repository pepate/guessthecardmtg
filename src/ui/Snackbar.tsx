import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore } from '../state/gameStore';
import { useCountUp } from './useCountUp';

export function Snackbar() {
  const earned = useGameStore((s) => s.earned);
  const seq = useGameStore((s) => s.earnedSeq);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (seq === 0 || earned <= 0) return;
    setVisible(true);
    const id = setTimeout(() => setVisible(false), 1500);
    return () => clearTimeout(id);
  }, [seq, earned]);

  // Count up from 0 to the points earned, restarting on each new guess.
  const shown = useCountUp(earned, 800, seq, 0);

  return (
    <div
      style={{
        position: 'absolute',
        top: 'calc(64px + env(safe-area-inset-top))',
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 30,
      }}
    >
      <AnimatePresence>
        {visible && (
          <motion.div
            key={seq}
            data-testid="snackbar"
            initial={{ opacity: 0, y: -24, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 420, damping: 26 }}
            style={{
              background: 'linear-gradient(180deg, rgba(255,138,60,0.95), rgba(180,70,20,0.95))',
              color: '#fff',
              borderRadius: 999,
              padding: '10px 22px',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: 0.5,
              boxShadow: '0 8px 30px rgba(255,122,44,0.45)',
            }}
          >
            +<span data-testid="snackbar-points">{shown}</span> Punkte
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
