import { useEffect, useState } from 'react';
import { useGameStore } from '../state/gameStore';
import { listModes, randomMode } from '../customModes/client';
import type { CustomMode, CustomModeListItem } from '../customModes/types';
import { FilterChips } from './FilterChips';
import { CustomModeBuilder } from './CustomModeBuilder';
import { CustomModeDetail } from './CustomModeDetail';

type View = 'list' | 'detail' | 'builder';

export function CustomModeBrowser({ onBack }: { onBack: () => void }) {
  const selectPool = useGameStore((s) => s.selectPool);
  const [modes, setModes] = useState<CustomModeListItem[]>([]);
  const [view, setView] = useState<View>('list');
  const [selected, setSelected] = useState<CustomMode | null>(null);
  const [existed, setExisted] = useState(false);
  const [loading, setLoading] = useState(true);

  function refreshModes() {
    listModes()
      .then((m) => setModes(m))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let cancelled = false;
    listModes()
      .then((m) => { if (!cancelled) { setModes(m); setLoading(false); } })
      .catch(() => { if (!cancelled) { setModes([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  function backToList() {
    refreshModes();
    setView('list');
  }

  function openDetail(mode: CustomMode, didExist = false) {
    setSelected(mode);
    setExisted(didExist);
    setView('detail');
  }

  async function onRandom() {
    const m = await randomMode();
    if (m) openDetail(m);
  }

  function onPlay(mode: CustomMode) {
    void selectPool({ kind: 'custom', modeId: mode.id, filter: mode.filter, name: mode.name });
  }

  if (view === 'builder') {
    return (
      <div className="bottom-sheet" style={{ maxHeight: '92%', overflowY: 'auto' }}>
        <CustomModeBuilder
          onCreated={(mode, didExist) => openDetail(mode, didExist)}
          onCancel={backToList}
          onExisting={(mode) => openDetail(mode, true)}
        />
      </div>
    );
  }

  if (view === 'detail' && selected) {
    return (
      <div className="bottom-sheet" style={{ maxHeight: '92%', overflowY: 'auto' }}>
        <CustomModeDetail mode={selected} existed={existed} onBack={backToList} onPlay={onPlay} />
      </div>
    );
  }

  return (
    <div className="bottom-sheet" style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '92%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="ghost-btn" onClick={onBack} aria-label="Back to menu" data-testid="custom-back" style={{ padding: '6px 12px' }}>←</button>
        <h2 style={{ margin: 0, color: 'var(--ink-0)', fontSize: 22 }}>Custom Modes</h2>
      </div>

      <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--ink-2)' }}><span className="spinner" /></div>
        ) : modes.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--ink-2)', fontSize: 13 }}>No modes yet — create the first one.</p>
        ) : (
          modes.map((m) => (
            <button key={m.id} onClick={() => openDetail(m)} data-testid="mode-row"
              style={{
                display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch', textAlign: 'left',
                padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line-strong)',
                background: 'rgba(20,17,28,0.5)', color: 'var(--ink-0)', cursor: 'pointer',
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 15 }}>{m.name}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>
                  {m.entry_count} {m.entry_count === 1 ? 'score' : 'scores'}
                </span>
              </div>
              <FilterChips filter={m.filter} />
            </button>
          ))
        )}
      </div>

      <div style={{ flexShrink: 0, display: 'flex', gap: 10 }}>
        <button className="ember-btn" style={{ flex: 1 }} onClick={() => setView('builder')} data-testid="create-open">Create</button>
        <button className="ghost-btn" style={{ flex: 1 }} onClick={onRandom} disabled={modes.length === 0} data-testid="random-mode">Random</button>
      </div>
    </div>
  );
}
