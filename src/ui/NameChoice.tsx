import { motion } from 'framer-motion';
import { useGameStore } from '../state/gameStore';

type OptionState = 'idle' | 'correct' | 'wrong' | 'dim';

function styleFor(state: OptionState): React.CSSProperties {
  switch (state) {
    case 'correct':
      return {
        border: '1px solid rgba(120,230,150,0.9)',
        background: 'linear-gradient(180deg, rgba(70,200,110,0.35), rgba(20,60,30,0.6))',
        color: '#eafff0',
        boxShadow: '0 0 18px rgba(70,200,110,0.4)',
      };
    case 'wrong':
      return {
        border: '1px solid rgba(230,110,110,0.9)',
        background: 'linear-gradient(180deg, rgba(200,60,60,0.35), rgba(60,20,20,0.6))',
        color: '#ffeaea',
        boxShadow: '0 0 18px rgba(200,60,60,0.35)',
      };
    case 'dim':
      return {
        border: '1px solid var(--line)',
        background: 'rgba(20,17,28,0.5)',
        color: 'var(--ink-2)',
        opacity: 0.55,
      };
    default:
      return {
        border: '1px solid var(--line-strong)',
        background: 'linear-gradient(180deg, rgba(255,186,120,0.08), rgba(20,17,28,0.6))',
        color: 'var(--ink-0)',
      };
  }
}

export function NameChoice() {
  const round = useGameStore((s) => s.round);
  const guessName = useGameStore((s) => s.guessName);

  if (!round) return null;

  const resolved = round.status !== 'playing';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}
    >
      {round.options.map((name) => {
        let state: OptionState = 'idle';
        if (resolved) {
          if (name === round.target.name) state = 'correct';
          else if (name === round.guess) state = 'wrong';
          else state = 'dim';
        }
        return (
          <button
            key={name}
            data-testid="name-option"
            data-state={state}
            disabled={resolved}
            onClick={() => guessName(name)}
            style={{
              minHeight: 60,
              borderRadius: 12,
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 19,
              fontWeight: 600,
              lineHeight: 1.15,
              cursor: resolved ? 'default' : 'pointer',
              padding: '8px 12px',
              textAlign: 'center',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              transition: 'background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
              ...styleFor(state),
            }}
          >
            {name}
          </button>
        );
      })}
    </motion.div>
  );
}
