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
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        background: 'rgba(7,6,10,0.55)',
        backdropFilter: 'blur(4px)',
        zIndex: 20,
        pointerEvents: 'all',
      }}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        data-testid="scoreboard"
        data-result={round.status}
        style={{
          background: 'linear-gradient(180deg, rgba(20,17,28,0.96), rgba(7,6,10,0.98))',
          borderRadius: '18px 18px 0 0',
          padding: '26px 22px calc(26px + env(safe-area-inset-bottom))',
          width: '100%',
          maxWidth: 460,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          borderTop: `2px solid ${won ? 'var(--ember)' : 'rgba(120,40,40,0.6)'}`,
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
              letterSpacing: 3,
              textTransform: 'uppercase',
              color: won ? 'var(--ember-hot)' : 'var(--ink-2)',
            }}
          >
            {won ? 'Richtig erkannt' : round.guess ? 'Daneben' : 'Zeit abgelaufen'}
          </div>
          <div style={{ fontSize: 30, fontWeight: 700, color: 'var(--ink-0)', margin: '6px 0 2px' }}>
            {cardName}
          </div>
          {won && (
            <div style={{ color: 'var(--ember-hot)', fontSize: 22, fontWeight: 600 }}>
              +{round.score} Punkte
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 28,
            padding: '12px 0',
            borderTop: '1px solid var(--line)',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <Stat label="GESAMT" value={totalScore} color="var(--ink-0)" />
          <Stat label="STREAK" value={streak} color="var(--ember-hot)" />
        </div>

        <button className="ember-btn" style={{ width: '100%' }} onClick={nextRound}>
          Nächste Karte
        </button>
        <button className="ghost-btn" style={{ width: '100%' }} onClick={reset}>
          Zurück zur Auswahl
        </button>
      </motion.div>
    </motion.div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          color: 'var(--ink-2)',
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 1.5,
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        {label}
      </div>
      <div style={{ color, fontSize: 26, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
