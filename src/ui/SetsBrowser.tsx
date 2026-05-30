import { useEffect, useState } from 'react';
import { useGameStore } from '../state/gameStore';
import { fetchSetList } from '../sets/client';
import type { SetListItem } from '../sets/client';
import { SetDetail } from './SetDetail';

type SortMode = 'popular' | 'newest';
type View = 'list' | 'detail';

const RECENT_DAYS = 30;
const MS_PER_DAY = 86_400_000;

function setYear(releasedAt: string | null): string {
  if (!releasedAt) return '';
  return new Date(releasedAt).getUTCFullYear().toString();
}

function sortedMain(sets: SetListItem[], sort: SortMode): SetListItem[] {
  const cutoff = Date.now() - RECENT_DAYS * MS_PER_DAY;
  const recent: SetListItem[] = [];
  const rest: SetListItem[] = [];
  for (const s of sets) {
    const t = s.lastActivity ? new Date(s.lastActivity).getTime() : 0;
    (t >= cutoff ? recent : rest).push(s);
  }
  recent.sort((a, b) => {
    const ta = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
    const tb = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
    return tb - ta;
  });
  if (sort === 'newest') {
    rest.sort((a, b) => {
      const ta = a.releasedAt ? new Date(a.releasedAt).getTime() : 0;
      const tb = b.releasedAt ? new Date(b.releasedAt).getTime() : 0;
      return tb - ta;
    });
  } else {
    rest.sort((a, b) => b.entryCount - a.entryCount);
  }
  return [...recent, ...rest];
}

function sortedSearch(sets: SetListItem[]): SetListItem[] {
  return [...sets].sort((a, b) => {
    const ta = a.releasedAt ? new Date(a.releasedAt).getTime() : 0;
    const tb = b.releasedAt ? new Date(b.releasedAt).getTime() : 0;
    return tb - ta;
  });
}

function matchesQuery(s: SetListItem, q: string): boolean {
  const lower = q.toLowerCase();
  return s.name.toLowerCase().includes(lower) || s.code.toLowerCase().includes(lower);
}

export function SetsBrowser({ onBack }: { onBack: () => void }) {
  const [sets, setSets] = useState<SetListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [view, setView] = useState<View>('list');
  const [selected, setSelected] = useState<SetListItem | null>(null);
  const [sort, setSort] = useState<SortMode>('popular');
  const [query, setQuery] = useState('');
  const [unplayedOnly, setUnplayedOnly] = useState(false);

  function loadSets() {
    setLoading(true);
    setError(false);
    fetchSetList()
      .then((list) => { setSets(list); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchSetList()
      .then((list) => { if (!cancelled) { setSets(list); setLoading(false); } })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  function openDetail(s: SetListItem) {
    setSelected(s);
    setView('detail');
  }

  function backToList() {
    loadSets();
    setView('list');
  }

  if (view === 'detail' && selected) {
    return (
      <div className="bottom-sheet" style={{ maxHeight: '92%', overflowY: 'auto' }}>
        <SetDetail set={selected} onBack={backToList} />
      </div>
    );
  }

  const searchActive = query.trim().length >= 2 || unplayedOnly;

  let displaySets: SetListItem[];
  if (searchActive) {
    let filtered = sets;
    if (query.trim().length >= 2) filtered = filtered.filter((s) => matchesQuery(s, query.trim()));
    if (unplayedOnly) filtered = filtered.filter((s) => s.entryCount === 0);
    displaySets = sortedSearch(filtered);
  } else {
    const played = sets.filter((s) => s.entryCount > 0);
    displaySets = sortedMain(played, sort);
  }

  return (
    <div className="bottom-sheet" style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '92%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="ghost-btn" onClick={onBack} aria-label="Back to menu" data-testid="sets-back" style={{ padding: '6px 12px' }}>←</button>
        <h2 style={{ margin: 0, color: 'var(--ink-0)', fontSize: 22 }}>Sets</h2>
      </div>

      {/* Search + filter row */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <input
          type="search"
          placeholder="Search by name or code…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="set-search-input"
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid var(--line-strong)',
            background: 'rgba(20,17,28,0.6)',
            color: 'var(--ink-0)',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 13,
            outline: 'none',
          }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--ink-2)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={unplayedOnly}
            onChange={(e) => setUnplayedOnly(e.target.checked)}
            data-testid="unplayed-toggle"
            style={{ width: 14, height: 14, accentColor: 'var(--ember)' }}
          />
          Unplayed only
        </label>
      </div>

      {/* Sort controls — only shown in main list mode */}
      {!searchActive && (
        <div style={{ display: 'flex', gap: 8 }} data-testid="sets-sort">
          <button
            onClick={() => setSort('popular')}
            className={sort === 'popular' ? 'ember-btn' : 'ghost-btn'}
            style={{ flex: 1, padding: '6px 12px', fontSize: 12 }}
          >
            Most played
          </button>
          <button
            onClick={() => setSort('newest')}
            className={sort === 'newest' ? 'ember-btn' : 'ghost-btn'}
            style={{ flex: 1, padding: '6px 12px', fontSize: 12 }}
          >
            Newest
          </button>
        </div>
      )}

      {/* List */}
      <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--ink-2)' }}><span className="spinner" /></div>
        ) : error ? (
          <p style={{ textAlign: 'center', color: 'var(--ink-2)', fontSize: 13 }}>Failed to load sets.</p>
        ) : displaySets.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--ink-2)', fontSize: 13 }}>
            {searchActive ? 'No matching sets.' : 'No played sets yet.'}
          </p>
        ) : searchActive ? (
          <SearchResults sets={displaySets} onOpen={openDetail} />
        ) : (
          displaySets.map((s) => (
            <MainRow key={s.code} set={s} onOpen={() => openDetail(s)} />
          ))
        )}
      </div>
    </div>
  );
}

function MainRow({ set, onOpen }: { set: SetListItem; onOpen: () => void }) {
  const year = setYear(set.releasedAt);
  return (
    <button
      onClick={onOpen}
      data-testid="set-row"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        textAlign: 'left',
        padding: '10px 12px',
        borderRadius: 10,
        border: '1px solid var(--line-strong)',
        background: 'rgba(20,17,28,0.5)',
        color: 'var(--ink-0)',
        cursor: 'pointer',
        width: '100%',
      }}
    >
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--ink-2)', minWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {set.championName ?? '—'}
      </span>
      <span style={{ flex: 1, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {set.name}
        {year && <span style={{ color: 'var(--ink-2)', fontSize: 12, marginLeft: 6 }}>{year}</span>}
      </span>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>
        {set.entryCount} {set.entryCount === 1 ? 'score' : 'scores'}
      </span>
    </button>
  );
}

function SearchResults({ sets, onOpen }: { sets: SetListItem[]; onOpen: (s: SetListItem) => void }) {
  const played = (s: SetListItem) => s.entryCount > 0;

  return (
    <>
      {sets.map((s) => {
        const year = setYear(s.releasedAt);
        if (played(s)) {
          return (
            <button
              key={s.code}
              onClick={() => onOpen(s)}
              data-testid="set-row"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                textAlign: 'left',
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid var(--line-strong)',
                background: 'rgba(20,17,28,0.5)',
                color: 'var(--ink-0)',
                cursor: 'pointer',
                width: '100%',
              }}
            >
              <span style={{ flex: 1, fontSize: 14 }}>
                {s.name}
                {year && <span style={{ color: 'var(--ink-2)', fontSize: 12, marginLeft: 6 }}>{year}</span>}
              </span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>
                {s.entryCount} {s.entryCount === 1 ? 'score' : 'scores'}
              </span>
            </button>
          );
        }
        return (
          <div
            key={s.code}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid var(--line-strong)',
              background: 'rgba(20,17,28,0.5)',
            }}
          >
            <span style={{ flex: 1, fontSize: 14, color: 'var(--ink-0)' }}>
              {s.name}
              {year && <span style={{ color: 'var(--ink-2)', fontSize: 12, marginLeft: 6 }}>{year}</span>}
            </span>
            <button
              className="ember-btn"
              data-testid="set-play-inline"
              style={{ padding: '4px 12px', fontSize: 12 }}
              onClick={() => useGameStore.getState().selectPool({ kind: 'set', code: s.code, name: s.name, modeId: null })}
            >
              Play
            </button>
          </div>
        );
      })}
    </>
  );
}
