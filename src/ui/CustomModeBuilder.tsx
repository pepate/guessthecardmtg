import { useEffect, useMemo, useState } from 'react';
import {
  CARD_TYPES, COLORS, RARITIES, validateFilter,
  type CardType, type ColorCode, type CustomFilter, type Range, type Rarity,
} from '../customModes/filter';
import { countFilteredCards, createMode, listSets, findExistingMode, type SetItem } from '../customModes/client';
import type { CustomMode } from '../customModes/types';

const COLOR_LABEL: Record<ColorCode, string> = {
  W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green', C: 'Colorless',
};
const MIN_CARDS = 100;

const section: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 };
const legend: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 1.5,
  textTransform: 'uppercase', color: 'var(--ink-2)',
};
const numInput: React.CSSProperties = {
  width: 70, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--line-strong)',
  background: 'rgba(20,17,28,0.6)', color: 'var(--ink-0)', fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
};

function toggle<T>(list: T[] | undefined, value: T): T[] {
  const set = new Set(list ?? []);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return [...set];
}

function Chip({ active, disabled, onClick, children }: {
  active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '6px 12px', borderRadius: 999, cursor: disabled ? 'not-allowed' : 'pointer',
        border: active ? '1px solid var(--ember)' : '1px solid var(--line-strong)',
        background: active ? 'rgba(255,138,60,0.18)' : 'rgba(20,17,28,0.5)',
        color: active ? 'var(--ember-hot)' : 'var(--ink-1)', opacity: disabled ? 0.4 : 1,
        fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
      }}
    >
      {children}
    </button>
  );
}

function RangeRow({ label, value, onChange, disabled }: {
  label: string; value: Range | undefined; onChange: (r: Range) => void; disabled?: boolean;
}) {
  const num = (s: string): number | undefined => (s === '' ? undefined : Number(s));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ minWidth: 64, color: 'var(--ink-1)', fontSize: 13 }}>{label}</span>
      <input type="number" style={numInput} placeholder="min" disabled={disabled}
        value={value?.min ?? ''} onChange={(e) => onChange({ ...value, min: num(e.target.value) })} />
      <span style={{ color: 'var(--ink-2)' }}>–</span>
      <input type="number" style={numInput} placeholder="max" disabled={disabled}
        value={value?.max ?? ''} onChange={(e) => onChange({ ...value, max: num(e.target.value) })} />
    </div>
  );
}

export function CustomModeBuilder({ onCreated, onCancel, onExisting }: {
  onCreated: (mode: CustomMode, existed: boolean) => void;
  onCancel: () => void;
  onExisting: (mode: CustomMode) => void;
}) {
  const [filter, setFilter] = useState<CustomFilter>({});
  const [count, setCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sets, setSets] = useState<SetItem[]>([]);
  const [setQuery, setSetQuery] = useState('');
  const [existing, setExisting] = useState<CustomMode | null>(null);

  useEffect(() => {
    let cancelled = false;
    listSets().then((s) => { if (!cancelled) setSets(s); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const validation = useMemo(() => validateFilter(filter), [filter]);
  const creatureOnly = filter.types?.length === 1 && filter.types[0] === 'Creature';
  const singleSet = filter.sets?.length === 1;

  useEffect(() => {
    if (!validation.ok) { setCount(null); return; }
    setCounting(true);
    const id = setTimeout(() => {
      countFilteredCards(filter)
        .then((n) => { setCount(n); setCounting(false); })
        .catch(() => { setCount(null); setCounting(false); });
    }, 300);
    return () => clearTimeout(id);
  }, [filter, validation.ok]);

  const canCreate = validation.ok && (count ?? 0) >= MIN_CARDS && !creating;

  function patch(p: Partial<CustomFilter>) { setFilter((f) => ({ ...f, ...p })); }

  async function onCreate() {
    setCreating(true);
    setError(null);
    const res = await createMode(filter);
    setCreating(false);
    if (!res.ok) { setError(res.reason === 'too-few' ? `Only ${res.count} cards — need ≥${MIN_CARDS}.` : 'Could not create this mode.'); return; }
    onCreated(res.mode, res.existed);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 420, margin: '0 auto' }}>
      <h2 style={{ margin: 0, textAlign: 'center', color: 'var(--ink-0)', fontSize: 24 }}>Build a mode</h2>

      <div style={section}>
        <span style={legend}>Set filter (exclusive)</span>
        {filter.sets?.length === 1 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span data-testid="set-chosen" style={{ flex: 1, color: 'var(--ink-0)', fontSize: 14 }}>
              {sets.find((s) => s.code === filter.sets![0])?.name ?? filter.sets![0].toUpperCase()}
              {(() => { const y = sets.find((s) => s.code === filter.sets![0])?.released_at?.slice(0, 4); return y ? ` · ${y}` : ''; })()}
            </span>
            <button type="button" className="ghost-btn" style={{ padding: '4px 10px' }}
              onClick={() => { patch({ sets: undefined }); setExisting(null); setSetQuery(''); }}>×</button>
          </div>
        ) : (
          <>
            <input
              type="text" data-testid="set-search" placeholder="Search a set by name — locks out other filters"
              value={setQuery}
              onChange={(e) => setSetQuery(e.target.value)}
              style={{ ...numInput, width: '100%' }}
            />
            {setQuery.trim().length >= 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 180, overflowY: 'auto' }}>
                {sets
                  .filter((s) => s.name.toLowerCase().includes(setQuery.trim().toLowerCase()) || s.code.includes(setQuery.trim().toLowerCase()))
                  .slice(0, 30)
                  .map((s) => (
                    <button key={s.code} type="button" data-testid="set-option"
                      onClick={async () => {
                        patch({ sets: [s.code] });
                        setSetQuery('');
                        const m = await findExistingMode({ sets: [s.code] }).catch(() => null);
                        setExisting(m);
                      }}
                      style={{ textAlign: 'left', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line-strong)',
                        background: 'rgba(20,17,28,0.5)', color: 'var(--ink-1)', cursor: 'pointer', fontSize: 13 }}>
                      {s.name}{s.released_at ? ` · ${s.released_at.slice(0, 4)}` : ''}
                    </button>
                  ))}
              </div>
            )}
          </>
        )}
        {existing && (
          <button type="button" data-testid="existing-mode-link" onClick={() => onExisting(existing)}
            style={{ textAlign: 'left', color: 'var(--ember-hot)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: 0 }}>
            This set already has a mode → View it
          </button>
        )}
      </div>

      <fieldset style={{ ...section, border: 'none', padding: 0, margin: 0, opacity: singleSet ? 0.4 : 1 }} disabled={singleSet}>
        <span style={legend}>Colors</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {COLORS.map((c) => (
            <Chip key={c} active={!!filter.colors?.values.includes(c)}
              onClick={() => {
                const values = toggle(filter.colors?.values, c) as ColorCode[];
                patch({ colors: values.length ? { values, match: filter.colors?.match ?? 'any' } : undefined });
              }}>
              {COLOR_LABEL[c]}
            </Chip>
          ))}
        </div>
        {filter.colors && filter.colors.values.length > 1 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink-1)', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
            <input type="checkbox" checked={filter.colors.match === 'all'}
              onChange={(e) => patch({ colors: { values: filter.colors!.values, match: e.target.checked ? 'all' : 'any' } })}
              style={{ accentColor: 'var(--ember)' }} />
            Match ALL selected colors (else any)
          </label>
        )}

        <span style={legend}>Types</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {CARD_TYPES.map((t) => (
            <Chip key={t} active={!!filter.types?.includes(t)}
              onClick={() => {
                const types = toggle(filter.types, t) as CardType[];
                patch({ types: types.length ? types : undefined });
              }}>
              {t}
            </Chip>
          ))}
        </div>

        <span style={legend}>Ranges</span>
        <RangeRow label="CMC" value={filter.cmc} onChange={(r) => patch({ cmc: r })} />
        <RangeRow label="EDH rank" value={filter.edhrec} onChange={(r) => patch({ edhrec: r })} />
        <RangeRow label="Year" value={filter.year} onChange={(r) => patch({ year: r })} />
        {creatureOnly && <RangeRow label="Power" value={filter.power} onChange={(r) => patch({ power: r })} />}
        {creatureOnly && <RangeRow label="Toughness" value={filter.toughness} onChange={(r) => patch({ toughness: r })} />}

        <span style={legend}>Universe Beyond</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['no', 'yes', 'only'] as const).map((v) => (
            <Chip key={v} active={(filter.ub ?? 'no') === v} onClick={() => patch({ ub: v })}>
              {v === 'no' ? 'Exclude' : v === 'yes' ? 'Include' : 'Only UB'}
            </Chip>
          ))}
        </div>

        <span style={legend}>Rarity</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {RARITIES.map((r) => (
            <Chip key={r} active={!!filter.rarities?.includes(r)}
              onClick={() => {
                const rarities = toggle(filter.rarities, r) as Rarity[];
                patch({ rarities: rarities.length ? rarities : undefined });
              }}>
              {r[0].toUpperCase() + r.slice(1)}
            </Chip>
          ))}
        </div>
      </fieldset>

      <div data-testid="card-count" style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: (count ?? 0) >= MIN_CARDS ? 'var(--ink-0)' : 'var(--ink-2)' }}>
        {!validation.ok
          ? (validation.reason === 'pt-requires-creature' ? 'Power/Toughness need Creature-only type'
            : validation.reason === 'single-set-exclusive' ? 'One set selected — remove other filters'
            : 'Adjust the ranges')
          : counting ? 'Counting…'
          : count == null ? '—'
          : count >= MIN_CARDS ? `${count.toLocaleString()} cards — playable`
          : `${count.toLocaleString()} cards — need ≥${MIN_CARDS}`}
      </div>

      {error && <p style={{ color: 'var(--ember-hot)', fontSize: 12, textAlign: 'center', margin: 0 }}>{error}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button className="ember-btn" style={{ width: '100%' }} disabled={!canCreate} onClick={onCreate} data-testid="create-mode-btn">
          {creating ? 'Creating…' : 'Create & view'}
        </button>
        <button className="ghost-btn" style={{ width: '100%' }} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
