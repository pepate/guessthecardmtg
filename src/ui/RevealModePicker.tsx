import { useGameStore } from '../state/gameStore';
import { REVEAL_MODE_LABELS } from '../reveal/labels';
import type { RevealMode } from '../engine/timeAttack';

export function RevealModePicker() {
  const enabledModes = useGameStore((s) => s.enabledModes);
  const pending = useGameStore((s) => s.pendingRevealChoice);
  const setRevealChoice = useGameStore((s) => s.setRevealChoice);

  const choices: (RevealMode | 'random')[] = ['random', ...enabledModes];

  return (
    <div
      data-testid="reveal-picker"
      style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}
    >
      {choices.map((c) => {
        const active = c === pending;
        return (
          <button
            key={c}
            type="button"
            onClick={() => setRevealChoice(c)}
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
              padding: '6px 12px',
              borderRadius: 999,
              cursor: 'pointer',
              color: active ? 'var(--ink-0)' : 'var(--ink-2)',
              background: active ? 'rgba(255,138,60,0.18)' : 'rgba(20,17,28,0.5)',
              border: `1px solid ${active ? 'var(--ember)' : 'var(--line)'}`,
            }}
          >
            {c === 'random' ? 'Random' : REVEAL_MODE_LABELS[c]}
          </button>
        );
      })}
    </div>
  );
}
