import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ATTRIBUTE_DEFS, cardHasAttribute } from '../engine/attributes';
import { useGameStore } from '../state/gameStore';
import type { AttributeKind, AttributeValue, RoundState } from '../engine/types';
import type { Color } from '../scryfall/types';

const COLORS: Color[] = ['W', 'U', 'B', 'R', 'G'];
const COLOR_LABELS: Record<Color, string> = { W: 'W', U: 'U', B: 'B', R: 'R', G: 'G' };
const COLOR_BG: Record<Color, string> = {
  W: '#f5f0d0',
  U: '#2a5bc7',
  B: '#2a1a2e',
  R: '#c0281a',
  G: '#1a7a30',
};

const PRIMARY_TYPES = [
  'Creature', 'Planeswalker', 'Enchantment', 'Artifact',
  'Land', 'Instant', 'Sorcery', 'Battle',
];

interface Props {
  round: RoundState;
}

export function AttributeGuess({ round }: Props) {
  const guessAttribute = useGameStore((s) => s.guessAttribute);

  const guessable = ATTRIBUTE_DEFS.filter(
    (d) => !round.reveals[d.kind] && cardHasAttribute(round.target, d.kind),
  );

  const [selected, setSelected] = useState<AttributeKind | null>(
    guessable[0]?.kind ?? null,
  );
  const [colorPick, setColorPick] = useState<Color[]>([]);
  const [cmcVal, setCmcVal] = useState(0);
  const [typePick, setTypePick] = useState(PRIMARY_TYPES[0]);
  const [powerVal, setPowerVal] = useState(0);

  if (guessable.length === 0) return null;

  const activeKind = selected ?? guessable[0].kind;

  function buildValue(): AttributeValue {
    switch (activeKind) {
      case 'color':
        return { kind: 'color', value: colorPick };
      case 'cmc':
        return { kind: 'cmc', value: cmcVal };
      case 'type':
        return { kind: 'type', value: typePick };
      case 'power':
        return { kind: 'power', value: powerVal };
    }
  }

  function submit() {
    guessAttribute(buildValue());
  }

  const tabBtn = (kind: AttributeKind, label: string) => (
    <button
      key={kind}
      onClick={() => setSelected(kind)}
      style={{
        minHeight: 44,
        padding: '8px 14px',
        borderRadius: 8,
        border: 'none',
        background: activeKind === kind ? 'rgba(100,160,255,0.35)' : 'rgba(255,255,255,0.08)',
        color: activeKind === kind ? '#fff' : '#aaa',
        fontWeight: 600,
        fontSize: 13,
        cursor: 'pointer',
        flex: 1,
      }}
    >
      {label}
    </button>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: 'rgba(10,10,20,0.75)',
        backdropFilter: 'blur(12px)',
        borderRadius: '16px 16px 0 0',
        padding: '16px 16px',
        paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', gap: 6 }}>
        {guessable.map((d) => tabBtn(d.kind, d.label))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeKind}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
        >
          {activeKind === 'color' && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() =>
                    setColorPick((prev) =>
                      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
                    )
                  }
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    border: colorPick.includes(c)
                      ? '3px solid #fff'
                      : '2px solid rgba(255,255,255,0.2)',
                    background: COLOR_BG[c],
                    color: c === 'W' ? '#333' : '#fff',
                    fontWeight: 700,
                    fontSize: 16,
                    cursor: 'pointer',
                  }}
                >
                  {COLOR_LABELS[c]}
                </button>
              ))}
            </div>
          )}

          {activeKind === 'cmc' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'center' }}>
              <button
                onClick={() => setCmcVal((v) => Math.max(0, v - 1))}
                style={stepBtn}
              >
                −
              </button>
              <span style={{ color: '#fff', fontSize: 28, fontWeight: 700, minWidth: 40, textAlign: 'center' }}>
                {cmcVal}
              </span>
              <button onClick={() => setCmcVal((v) => v + 1)} style={stepBtn}>
                +
              </button>
            </div>
          )}

          {activeKind === 'type' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {PRIMARY_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setTypePick(t)}
                  style={{
                    minHeight: 44,
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: typePick === t ? '2px solid #7af' : '1.5px solid rgba(255,255,255,0.15)',
                    background: typePick === t ? 'rgba(100,180,255,0.25)' : 'rgba(255,255,255,0.05)',
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: typePick === t ? 700 : 400,
                    cursor: 'pointer',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          {activeKind === 'power' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'center' }}>
              <button
                onClick={() => setPowerVal((v) => Math.max(0, v - 1))}
                style={stepBtn}
              >
                −
              </button>
              <span style={{ color: '#fff', fontSize: 28, fontWeight: 700, minWidth: 40, textAlign: 'center' }}>
                {powerVal}
              </span>
              <button onClick={() => setPowerVal((v) => v + 1)} style={stepBtn}>
                +
              </button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <button
        onClick={submit}
        style={{
          minHeight: 52,
          borderRadius: 12,
          border: 'none',
          background: 'rgba(100,160,255,0.5)',
          color: '#fff',
          fontWeight: 700,
          fontSize: 17,
          cursor: 'pointer',
        }}
      >
        Raten
      </button>
    </motion.div>
  );
}

const stepBtn: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 10,
  border: '1.5px solid rgba(255,255,255,0.2)',
  background: 'rgba(255,255,255,0.08)',
  color: '#fff',
  fontSize: 24,
  fontWeight: 700,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
