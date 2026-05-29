import { motion } from 'framer-motion';
import { useGameStore } from '../state/gameStore';

export function NameChoice() {
  const nameOptions = useGameStore((s) => s.nameOptions);
  const guessName = useGameStore((s) => s.guessName);
  const rollNameChoices = useGameStore((s) => s.rollNameChoices);
  const round = useGameStore((s) => s.round);

  if (!round || round.status !== 'playing') return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{ padding: '8px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <p
        style={{
          color: '#ccc',
          fontSize: 13,
          margin: 0,
          textAlign: 'center',
          fontWeight: 600,
          letterSpacing: 0.3,
        }}
      >
        Wie heißt die Karte?
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {nameOptions.map((name) => (
          <button
            key={name}
            onClick={() => guessName(name)}
            style={{
              minHeight: 48,
              borderRadius: 10,
              border: '1.5px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.07)',
              color: '#fff',
              fontSize: 16,
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'left',
              padding: '10px 16px',
            }}
          >
            {name}
          </button>
        ))}
      </div>

      <button
        onClick={rollNameChoices}
        style={{
          minHeight: 44,
          borderRadius: 10,
          border: '1.5px solid rgba(255,255,255,0.1)',
          background: 'transparent',
          color: '#888',
          fontSize: 13,
          cursor: 'pointer',
          marginTop: 2,
        }}
      >
        Optionen neu mischen
      </button>
    </motion.div>
  );
}
