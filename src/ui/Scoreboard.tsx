import { motion } from 'framer-motion';
import { useGameStore } from '../state/gameStore';

export function Scoreboard() {
  const round = useGameStore((s) => s.round);
  const totalScore = useGameStore((s) => s.totalScore);
  const streak = useGameStore((s) => s.streak);
  const nextRound = useGameStore((s) => s.nextRound);
  const reset = useGameStore((s) => s.reset);

  if (!round || round.status === 'playing') return null;

  const won = round.status === 'won';
  const cardName = round.target.name;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(10px)',
        zIndex: 20,
        padding: '24px 20px',
        paddingBottom: 'calc(24px + env(safe-area-inset-bottom))',
      }}
    >
      <div
        style={{
          background: 'rgba(15,15,30,0.9)',
          borderRadius: 20,
          padding: '28px 24px',
          width: '100%',
          maxWidth: 400,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          border: `2px solid ${won ? 'rgba(100,220,120,0.4)' : 'rgba(220,80,80,0.4)'}`,
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40 }}>{won ? '🎉' : '😢'}</div>
          <h2
            style={{
              color: won ? '#8f8' : '#f88',
              margin: '8px 0 4px',
              fontSize: 24,
              fontWeight: 700,
            }}
          >
            {won ? 'Richtig!' : 'Nicht getroffen'}
          </h2>
          <p style={{ color: '#ddd', fontSize: 18, margin: 0, fontWeight: 600 }}>{cardName}</p>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 20,
            background: 'rgba(255,255,255,0.05)',
            borderRadius: 12,
            padding: '12px 0',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#aaa', fontSize: 11, fontWeight: 600, letterSpacing: 0.5 }}>
              GESAMT
            </div>
            <div style={{ color: '#fff', fontSize: 26, fontWeight: 700 }}>{totalScore}</div>
          </div>
          <div style={{ width: 1, background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#aaa', fontSize: 11, fontWeight: 600, letterSpacing: 0.5 }}>
              STREAK
            </div>
            <div style={{ color: '#f90', fontSize: 26, fontWeight: 700 }}>{streak}</div>
          </div>
        </div>

        <button
          onClick={nextRound}
          style={{
            minHeight: 54,
            borderRadius: 14,
            border: 'none',
            background: 'rgba(100,160,255,0.55)',
            color: '#fff',
            fontSize: 18,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Nächste Karte
        </button>

        <button
          onClick={reset}
          style={{
            minHeight: 44,
            borderRadius: 12,
            border: '1.5px solid rgba(255,255,255,0.12)',
            background: 'transparent',
            color: '#888',
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Zurück zur Auswahl
        </button>
      </div>
    </motion.div>
  );
}
