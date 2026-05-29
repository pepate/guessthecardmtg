import { motion } from 'framer-motion';
import { ATTRIBUTE_DEFS, getDisplayValue, cardHasAttribute } from '../engine/attributes';
import type { RoundState } from '../engine/types';

interface Props {
  round: RoundState;
}

export function AttributeBar({ round }: Props) {
  const { target, reveals } = round;

  const visible = ATTRIBUTE_DEFS.filter((def) => cardHasAttribute(target, def.kind));

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        padding: '8px 16px',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {visible.map((def) => {
        const revealed = reveals[def.kind];
        const label = revealed ? getDisplayValue(target, def.kind) : '???';
        return (
          <motion.div
            key={def.kind}
            layout
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              background: revealed ? 'rgba(100,220,120,0.18)' : 'rgba(255,255,255,0.08)',
              border: `1.5px solid ${revealed ? 'rgba(100,220,120,0.5)' : 'rgba(255,255,255,0.15)'}`,
              borderRadius: 10,
              padding: '6px 14px',
              minWidth: 64,
              backdropFilter: 'blur(6px)',
              flexShrink: 0,
            }}
          >
            <span
              style={{ color: '#aaa', fontSize: 10, fontWeight: 600, letterSpacing: 0.5 }}
            >
              {def.label.toUpperCase()}
            </span>
            <motion.span
              key={label}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{
                color: revealed ? '#8f8' : '#888',
                fontSize: 15,
                fontWeight: 700,
                marginTop: 2,
              }}
            >
              {label}
            </motion.span>
          </motion.div>
        );
      })}
    </div>
  );
}
