import { useState } from 'react';
import type { SetListItem } from '../sets/client';

interface SetSelectProps {
  sets: SetListItem[];
  /** Selected set code, or null for "any set". */
  value: string | null;
  onChange: (set: SetListItem | null) => void;
}

/** Two-digit release year (e.g. "'24"), or "··" when unknown. */
function year2(releasedAt: string | null): string {
  const m = releasedAt?.match(/^(\d{4})/);
  return m ? `'${m[1].slice(2)}` : '··';
}

const field: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--line-strong)',
  background: 'rgba(20,17,28,0.6)',
  color: 'var(--ink-0)',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 13,
  cursor: 'pointer',
};

export function SetSelect({ sets, value, onChange }: SetSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = value ? sets.find((s) => s.code === value) ?? null : null;

  const q = query.trim().toLowerCase();
  const filtered = q
    ? sets.filter((s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q))
    : sets;

  function pick(set: SetListItem | null) {
    onChange(set);
    setOpen(false);
    setQuery('');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button type="button" data-testid="set-select" style={field} onClick={() => setOpen((o) => !o)}>
        <span style={{ flex: 1, textAlign: 'left', color: selected ? 'var(--ink-0)' : 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? `${selected.name} (${selected.code.toUpperCase()})` : 'Any set'}
        </span>
        {selected && (
          <span
            role="button"
            aria-label="Clear set"
            data-testid="set-clear"
            onClick={(e) => { e.stopPropagation(); pick(null); }}
            style={{ flex: '0 0 auto', color: 'var(--ink-2)', padding: '0 4px', fontSize: 14 }}
          >
            ✕
          </span>
        )}
        <span aria-hidden style={{ flex: '0 0 auto', color: 'var(--ink-2)' }}>{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div
          data-testid="set-dropdown"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            padding: 8,
            borderRadius: 10,
            border: '1px solid var(--line-strong)',
            background: 'rgba(13,11,19,0.92)',
          }}
        >
          <input
            autoFocus
            type="text"
            data-testid="set-search"
            placeholder="Search sets…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid var(--line-strong)',
              background: 'rgba(20,17,28,0.7)',
              color: 'var(--ink-0)',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 13,
            }}
          />
          <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {filtered.length === 0 ? (
              <p style={{ color: 'var(--ink-2)', fontSize: 12, textAlign: 'center', margin: '8px 0' }}>No sets match “{query}”.</p>
            ) : (
              filtered.slice(0, 100).map((s) => (
                <button
                  key={s.code}
                  type="button"
                  data-testid="set-option"
                  onClick={() => pick(s)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    textAlign: 'left',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: 'none',
                    cursor: 'pointer',
                    background: s.code === value ? 'rgba(255,138,60,0.18)' : 'transparent',
                    color: 'var(--ink-1)',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 13,
                  }}
                >
                  <span style={{ flex: 1, color: 'var(--ink-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                  <span style={{ flex: '0 0 auto', color: 'var(--ink-2)', fontSize: 11 }}>{year2(s.releasedAt)} · {s.code.toUpperCase()} · {s.eligibleCount}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
