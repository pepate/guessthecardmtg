import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../state/gameStore';

// Delay before the play icons start pulsing to invite a tap.
const HINT_DELAY_MS = 4000;

function PlayIcon({ hint }: { hint: boolean }) {
  return (
    <span className={hint ? 'play-icon play-hint' : 'play-icon'} data-testid="play-icon" aria-hidden>
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 5v14l11-7z" />
      </svg>
    </span>
  );
}

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
  padding: '10px 44px',
  position: 'relative',
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
  const challenge = useGameStore((s) => s.challenge);
  const [excludeUniverseBeyond, setExcludeUniverseBeyond] = useState(true);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setHint(true), HINT_DELAY_MS);
    return () => clearTimeout(id);
  }, []);

  function pick(kind: 'popular' | 'all') {
    void selectPool({ kind, excludeUniverseBeyond });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', maxWidth: 420, margin: '0 auto' }}
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

      {challenge && (
        <div
          data-testid="challenge-banner"
          style={{
            textAlign: 'center',
            padding: '10px 14px',
            borderRadius: 10,
            border: '1px solid var(--ember)',
            background: 'rgba(255,138,60,0.12)',
            color: 'var(--ink-0)',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          A friend scored{' '}
          <strong style={{ color: 'var(--ember-hot)' }}>{challenge.score}</strong> points
          {' '}({challenge.correct} cards) on the {challenge.pool === 'all' ? 'All cards' : 'Popular cards'} pool.
          <br />
          Can you beat them?
        </div>
      )}

      <button style={btn} onClick={() => pick('popular')}>
        Popular cards
        <span style={sub}>Well-known Commander staples</span>
        <PlayIcon hint={hint} />
      </button>

      <button style={btn} onClick={() => pick('all')}>
        All cards
        <span style={sub}>Everything from 2015 on</span>
        <PlayIcon hint={hint} />
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
    </motion.div>
  );
}
