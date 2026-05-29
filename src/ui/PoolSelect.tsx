import { useState } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../state/gameStore';
import type { PoolSelection } from '../scryfall/types';

const btn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  minHeight: 58,
  borderRadius: 12,
  border: '1px solid var(--line-strong)',
  background: 'linear-gradient(180deg, rgba(255,186,120,0.08), rgba(20,17,28,0.6))',
  color: 'var(--ink-0)',
  fontFamily: "'Cormorant Garamond', serif",
  fontSize: 19,
  fontWeight: 600,
  cursor: 'pointer',
  padding: '12px 16px',
  backdropFilter: 'blur(8px)',
};

export function PoolSelect() {
  const selectPool = useGameStore((s) => s.selectPool);
  const [setInput, setSetInput] = useState('');
  const [showSetInput, setShowSetInput] = useState(false);

  function pick(sel: PoolSelection) {
    void selectPool(sel);
  }

  function handleSets() {
    if (!showSetInput) {
      setShowSetInput(true);
      return;
    }
    const sets = setInput
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (sets.length === 0) return;
    pick({ kind: 'sets', sets });
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
          Wähle deinen Pool
        </p>
      </div>

      <button style={btn} onClick={() => pick({ kind: 'popular' })}>
        Beliebte Karten
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button style={btn} onClick={handleSets}>
          Nach Set
        </button>
        {showSetInput && (
          <motion.input
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 48 }}
            type="text"
            placeholder="Set-Codes, kommagetrennt (z.B. mh3, blb)"
            value={setInput}
            onChange={(e) => setSetInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSets()}
            style={{
              width: '100%',
              height: 48,
              borderRadius: 10,
              border: '1px solid var(--line-strong)',
              background: 'rgba(7,6,10,0.6)',
              color: 'var(--ink-0)',
              fontSize: 15,
              padding: '0 14px',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
        )}
      </div>

      <button style={btn} onClick={() => pick({ kind: 'random' })}>
        Komplett zufällig
      </button>
    </motion.div>
  );
}
