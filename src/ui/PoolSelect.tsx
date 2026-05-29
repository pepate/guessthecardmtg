import { useState } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../state/gameStore';
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
  const [excludeUniverseBeyond, setExcludeUniverseBeyond] = useState(true);

  function pick(kind: 'popular' | 'all') {
    void selectPool({ kind, excludeUniverseBeyond });
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
          90 seconds · guess as many as you can
        </p>
      </div>

      <button style={btn} onClick={() => pick('popular')}>
        Popular cards
        <span style={sub}>Well-known Commander staples</span>
      </button>

      <button style={btn} onClick={() => pick('all')}>
        All cards
        <span style={sub}>Everything from 2015 on</span>
      </button>

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12,
          letterSpacing: 0.5,
          color: 'var(--ink-1)',
          cursor: 'pointer',
          padding: '2px 4px',
        }}
      >
        <input
          type="checkbox"
          data-testid="exclude-ub"
          checked={excludeUniverseBeyond}
          onChange={(e) => setExcludeUniverseBeyond(e.target.checked)}
          style={{ width: 16, height: 16, accentColor: 'var(--ember)' }}
        />
        No Universe Beyond cards
      </label>

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
          Leaderboard
        </div>
        <HighscoreList entries={highscores} />
      </div>
    </motion.div>
  );
}
