import { useState } from 'react';
import { motion } from 'framer-motion';
import { Leaderboard } from './Leaderboard';

export function StartLeaderboard() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="ghost-btn"
        data-testid="open-leaderboard"
        style={{ width: '100%' }}
        onClick={() => setOpen(true)}
      >
        Leaderboard
      </button>

      {open && (
        <motion.div
          key="leaderboard-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 20,
            background: 'rgba(7,6,10,0.92)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 18,
            padding: '24px 22px calc(24px + env(safe-area-inset-bottom))',
            overflowY: 'auto',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: 420 }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: 2, textTransform: 'uppercase', fontSize: 13, color: 'var(--ink-2)' }}>
              Leaderboard
            </span>
            <button
              type="button"
              className="ghost-btn"
              data-testid="close-leaderboard"
              style={{ padding: '6px 14px' }}
              onClick={() => setOpen(false)}
            >
              Schließen
            </button>
          </div>
          <Leaderboard />
        </motion.div>
      )}
    </>
  );
}
