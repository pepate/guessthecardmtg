import { useState } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../state/gameStore';
import type { PoolSelection } from '../scryfall/types';

const btn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  minHeight: 56,
  borderRadius: 12,
  border: '2px solid rgba(255,255,255,0.15)',
  background: 'rgba(255,255,255,0.08)',
  color: '#fff',
  fontSize: 18,
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
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: '24px 20px',
        paddingBottom: 'calc(24px + env(safe-area-inset-bottom))',
      }}
    >
      <h1
        style={{
          color: '#fff',
          fontSize: 26,
          fontWeight: 700,
          textAlign: 'center',
          margin: 0,
          marginBottom: 8,
          textShadow: '0 2px 12px rgba(0,0,0,0.7)',
        }}
      >
        GuessTheCard
      </h1>

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
              border: '2px solid rgba(255,255,255,0.2)',
              background: 'rgba(0,0,0,0.4)',
              color: '#fff',
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
