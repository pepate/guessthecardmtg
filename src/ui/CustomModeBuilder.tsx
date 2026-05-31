import { useEffect, useMemo, useState } from 'react';
import {
  CARD_TYPES, COLORS, RARITIES, validateFilter, modeName,
  type CardType, type ColorCode, type CustomFilter, type Range, type Rarity,
} from '../modes/filter';
import { countFilteredCards, createMode } from '../modes/client';
import { fetchSetList, type SetListItem } from '../sets/client';
import type { CustomMode } from '../modes/types';
import { SetSelect } from './SetSelect';

const COLOR_LABEL: Record<ColorCode, string> = {
  W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green', C: 'Colorless',
};
const MIN_CARDS = 50;

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

export function CustomModeBuilder({ onCreated, onCancel }: {
  onCreated: (mode: CustomMode, existed: boolean) => void;
  onCancel: () => void;
}) {
  const [filter, setFilter] = useState<CustomFilter>({});
  const [count, setCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [sets, setSets] = useState<SetListItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchSetList()
      .then((list) => { if (!cancelled) setSets(list); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // A single set is exclusive (no other filters), so picking one locks the rest.
  const selectedSetCode = filter.sets?.length === 1 ? filter.sets[0] : null;
  const setLocked = selectedSetCode !== null;
  const selectedSet = selectedSetCode ? sets.find((s) => s.code === selectedSetCode) ?? null : null;

  // The suggested name tracks the filter until the player edits the field; a
  // chosen set suggests its full name (nicer than the bare set code).
  const suggested = useMemo(
    () => (selectedSet ? selectedSet.name : modeName(filter)),
    [filter, selectedSet],
  );
  const displayName = nameTouched ? name : suggested;

  const validation = useMemo(() => validateFilter(filter), [filter]);
  const creatureOnly = filter.types?.length === 1 && filter.types[0] === 'Creature';

  function selectSet(set: SetListItem | null) {
    // Replace the whole filter: a single set must stand alone.
    setFilter(set ? { sets: [set.code] } : {});
  }

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
    const res = await createMode(filter, displayName);
    setCreating(false);
    if (!res.ok) { setError(res.reason === 'too-few' ? `Only ${res.count} cards — need ≥${MIN_CARDS}.` : 'Could not create this mode.'); return; }
    onCreated(res.mode, res.existed);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 420, margin: '0 auto' }}>
      <h2 style={{ margin: 0, textAlign: 'center', color: 'var(--ink-0)', fontSize: 24 }}>Build a mode</h2>

      <div style={section}>
        <span style={legend}>Set</span>
        <SetSelect sets={sets} value={selectedSetCode} onChange={selectSet} />
        {setLocked && (
          <span style={{ fontSize: 11, color: 'var(--ink-2)', fontFamily: "'JetBrains Mono', monospace" }}>
            A single set is played on its own — other filters are disabled.
          </span>
        )}
      </div>

      <fieldset disabled={setLocked} style={{ ...section, border: 'none', padding: 0, margin: 0, opacity: setLocked ? 0.4 : 1 }}>
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

      <div style={section}>
        <label htmlFor="mode-name" style={legend}>Name</label>
        <input
          id="mode-name"
          data-testid="mode-name-input"
          type="text"
          value={displayName}
          maxLength={60}
          placeholder={suggested}
          onChange={(e) => { setNameTouched(true); setName(e.target.value); }}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid var(--line-strong)',
            background: 'rgba(20,17,28,0.6)',
            color: 'var(--ink-0)',
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 18,
            fontWeight: 700,
          }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button className="ember-btn" style={{ width: '100%' }} disabled={!canCreate} onClick={onCreate} data-testid="create-mode-btn">
          {creating ? 'Creating…' : 'Create & view'}
        </button>
        <button className="ghost-btn" style={{ width: '100%' }} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
