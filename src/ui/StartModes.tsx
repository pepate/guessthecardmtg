import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { listModes } from '../modes/client';
import type { CustomMode, CustomModeListItem } from '../modes/types';
import { fetchModeRuns } from '../leaderboard/client';
import { deviceModeStanding, type Run } from '../leaderboard/boards';
import { getDeviceId } from '../leaderboard/identity';
import { windowCutoff, WINDOW_TABS, type TimeWindow } from '../leaderboard/window';
import { ScoreValue } from './ScoreValue';
import { countryToFlag } from '../leaderboard/flag';

/** The mode's overall best run (any reveal), shown as the leader of the row. */
interface ModeTop {
  name: string;
  score: number;
  country: string | null;
}

interface ModeView {
  mode: CustomModeListItem;
  /** Device's best rank across this mode's reveal boards; null when unplaced. */
  standing: number | null;
  top: ModeTop | null;
}

interface ModeRowProps {
  name: string;
  standing: number | null;
  top: ModeTop | null;
  /** Total recorded scores (games) in this mode. */
  plays: number;
  onSelect: () => void;
}

const MAX_W = 700;
const centered: React.CSSProperties = { width: '100%', maxWidth: MAX_W, margin: '0 auto' };

function overallTop(runs: Run[]): ModeTop | null {
  let best: Run | null = null;
  for (const r of runs) if (!best || r.score > best.score) best = r;
  return best ? { name: best.name, score: best.score, country: best.country } : null;
}

// Highest top score first; modes with no scores fall to the bottom (alphabetical).
function sortModes(views: ModeView[]): ModeView[] {
  return [...views].sort((a, b) => {
    const as = a.top?.score ?? -1;
    const bs = b.top?.score ?? -1;
    if (bs !== as) return bs - as;
    return a.mode.name.localeCompare(b.mode.name);
  });
}

function RankBadge({ standing }: { standing: number | null }) {
  const first = standing === 1;
  const ranked = standing !== null;
  return (
    <span
      style={{
        flex: '0 0 auto',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1,
        padding: '4px 7px',
        borderRadius: 8,
        whiteSpace: 'nowrap',
        textAlign: 'center',
        minWidth: 34,
        border: `1px solid ${first ? 'var(--ember)' : ranked ? 'var(--line-strong)' : 'var(--line)'}`,
        background: first ? 'rgba(255,138,60,0.22)' : ranked ? 'rgba(255,186,120,0.10)' : 'rgba(255,255,255,0.04)',
        color: first ? 'var(--ember-hot)' : ranked ? 'var(--ink-0)' : 'var(--ink-2)',
      }}
    >
      {ranked ? `#${standing}` : 'new'}
    </span>
  );
}

function ModeRow({ name, standing, top, plays, onSelect }: ModeRowProps) {
  return (
    <button
      type="button"
      data-testid="mode-row"
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        textAlign: 'left',
        padding: '12px 14px',
        borderRadius: 12,
        border: '1px solid var(--line-strong)',
        background: 'rgba(20,17,28,0.68)',
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          flex: '1 1 auto',
          minWidth: 0,
          color: 'var(--ink-0)',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12,
          fontWeight: 600,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </span>
      {plays > 0 && (
        <span title="games played" style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 2, color: 'var(--ink-2)', fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>
          <span aria-hidden style={{ fontSize: 8 }}>▶</span>{plays}
        </span>
      )}
      {top && (
        <>
          <span aria-hidden style={{ flex: '0 0 auto', fontSize: 14 }}>{countryToFlag(top.country)}</span>
          <span
            style={{
              flex: '0 1 auto',
              minWidth: 0,
              maxWidth: 130,
              color: 'var(--ink-1)',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {top.name}
          </span>
          <span style={{ flex: '0 0 auto' }}>
            <ScoreValue score={top.score} fontSize={14} />
          </span>
        </>
      )}
      <RankBadge standing={standing} />
    </button>
  );
}

export function StartModes({
  onPick,
  onCreate,
}: {
  onPick: (mode: CustomMode) => void;
  onCreate: () => void;
}) {
  const [win, setWin] = useState<TimeWindow>('all');
  const [views, setViews] = useState<ModeView[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setViews(null);
    (async () => {
      const modes = await listModes(200);
      const device = getDeviceId();
      const since = windowCutoff(win);
      const built = await Promise.all(
        modes.map(async (mode) => {
          const runs = await fetchModeRuns(mode.id, since);
          return { mode, standing: deviceModeStanding(runs, device), top: overallTop(runs) };
        }),
      );
      if (!cancelled) setViews(sortModes(built));
    })().catch(() => {
      if (!cancelled) setViews([]);
    });
    return () => {
      cancelled = true;
    };
  }, [win]);

  return (
    <motion.div
      key="modes"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="bottom-sheet"
      style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '92%' }}
    >
      {/* Compact, horizontally-swipeable time-window pills. */}
      <div
        style={{
          ...centered,
          display: 'flex',
          gap: 6,
          flexShrink: 0,
          overflowX: 'auto',
          flexWrap: 'nowrap',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {WINDOW_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setWin(t.key)}
            aria-pressed={win === t.key}
            style={{
              flex: '0 0 auto',
              minHeight: 0,
              padding: '7px 16px',
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: 0.4,
              borderRadius: 999,
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              border: `1px solid ${win === t.key ? 'var(--ember)' : 'var(--line-strong)'}`,
              background: win === t.key ? 'var(--ember)' : 'transparent',
              color: win === t.key ? '#1a1020' : 'var(--ink-1)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        data-testid="mode-list"
        style={{
          ...centered,
          flex: '1 1 auto',
          minHeight: 0,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {views === null ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
            <span className="spinner" />
          </div>
        ) : views.length === 0 ? (
          <p data-testid="modes-empty" style={{ color: 'var(--ink-1)', fontSize: 14, textAlign: 'center', margin: 0 }}>
            No modes yet — create one below.
          </p>
        ) : (
          views.map(({ mode, standing, top }) => (
            <ModeRow key={mode.id} name={mode.name} standing={standing} top={top} plays={mode.entry_count} onSelect={() => onPick(mode)} />
          ))
        )}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.32, ease: 'easeOut' }}
        style={{ ...centered, flexShrink: 0, paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <button type="button" data-testid="create-mode-btn" className="ember-btn" onClick={onCreate} style={{ width: '100%' }}>
          Create Mode
        </button>
      </motion.div>
    </motion.div>
  );
}
