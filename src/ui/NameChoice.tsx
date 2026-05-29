import { motion } from 'framer-motion';
import { useGameStore } from '../state/gameStore';

export function NameChoice() {
  const round = useGameStore((s) => s.round);
  const guessName = useGameStore((s) => s.guessName);

  if (!round || round.status !== 'playing') return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}
    >
      {round.options.map((name) => (
        <button
          key={name}
          data-testid="name-option"
          onClick={() => guessName(name)}
          style={{
            minHeight: 60,
            borderRadius: 12,
            border: '1px solid var(--line-strong)',
            background: 'linear-gradient(180deg, rgba(255,186,120,0.08), rgba(20,17,28,0.6))',
            color: 'var(--ink-0)',
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 19,
            fontWeight: 600,
            lineHeight: 1.15,
            cursor: 'pointer',
            padding: '8px 12px',
            textAlign: 'center',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
          }}
        >
          {name}
        </button>
      ))}
    </motion.div>
  );
}
