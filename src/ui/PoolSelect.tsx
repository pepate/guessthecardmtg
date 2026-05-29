import { motion } from 'framer-motion';
import { useGameStore } from '../state/gameStore';
import type { PoolSelection } from '../scryfall/types';
import { HighscoreList } from './HighscoreList';

const btn: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  minHeight: 62,
  borderRadius: 12,
  border: '1px solid var(--line-strong)',
  background: 'linear-gradient(180deg, rgba(255,186,120,0.08), rgba(20,17,28,0.6))',
  color: 'var(--ink-0)',
  fontFamily: "'Cormorant Garamond', serif",
  fontSize: 19,
  fontWeight: 600,
  cursor: 'pointer',
  padding: '10px 16px',
  backdropFilter: 'blur(8px)',
};

const sub: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 10,
  letterSpacing: 1.5,
  textTransform: 'uppercase',
  color: 'var(--ink-2)',
  marginTop: 2,
};

export function PoolSelect() {
  const selectPool = useGameStore((s) => s.selectPool);
  const highscores = useGameStore((s) => s.highscores);

  function pick(sel: PoolSelection) {
    void selectPool(sel);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      <div style={{ textAlign: 'center', marginBottom: 4 }}>
        <h1
          style={{
            fontSize: 30,
            fontWeight: 700,
            margin: 0,
            color: 'var(--ink-0)',
            textShadow: '0 0 22px rgba(255,122,44,0.35)',
          }}
        >
          GuessTheCard
        </h1>
        <p
          style={{
            margin: '4px 0 0',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: 'var(--ink-2)',
          }}
        >
          15 Karten · errate so viele wie möglich
        </p>
      </div>

      <button style={btn} onClick={() => pick({ kind: 'popular' })}>
        Beliebte Karten
        <span style={sub}>Bekannte Commander-Karten</span>
      </button>

      <button style={btn} onClick={() => pick({ kind: 'all' })}>
        Alle Karten
        <span style={sub}>Alles ab 2015</span>
      </button>

      <div style={{ marginTop: 6 }}>
        <div
          style={{
            textAlign: 'center',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: 'var(--ink-2)',
            marginBottom: 8,
          }}
        >
          Bestenliste
        </div>
        <HighscoreList entries={highscores} />
      </div>
    </motion.div>
  );
}
