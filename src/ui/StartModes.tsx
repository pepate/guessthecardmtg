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

/** The mode's overall best run (any reveal), shown as a peek. */
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

interface ModeCardProps {
  name: string;
  standing: number | null;
  top: ModeTop | null;
  onSelect: () => void;
}

function overallTop(runs: Run[]): ModeTop | null {
  let best: Run | null = null;
  for (const r of runs) if (!best || r.score > best.score) best = r;
  return best ? { name: best.name, score: best.score, country: best.country } : null;
}

// "Zuerst keine Platzierung, zuletzt Platz 1": unplaced modes first, then ranked
// worst-to-best so the modes the player has already conquered sink to the bottom.
function sortModes(views: ModeView[]): ModeView[] {
  return [...views].sort((a, b) => {
    if (a.standing === null && b.standing === null) return a.mode.name.localeCompare(b.mode.name);
    if (a.standing === null) return -1;
    if (b.standing === null) return 1;
    return b.standing - a.standing;
  });
}

function StandingBadge({ standing }: { standing: number | null }) {
  const first = standing === 1;
  const ranked = standing !== null;
  return (
    <span
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1,
        padding: '4px 7px',
        borderRadius: 8,
        whiteSpace: 'nowrap',
        border: `1px solid ${first ? 'var(--ember)' : ranked ? 'var(--line-strong)' : 'var(--line)'}`,
        background: first ? 'rgba(255,138,60,0.22)' : ranked ? 'rgba(255,186,120,0.10)' : 'rgba(255,255,255,0.04)',
        color: first ? 'var(--ember-hot)' : ranked ? 'var(--ink-0)' : 'var(--ink-2)',
      }}
    >
      {ranked ? `#${standing}` : 'new'}
    </span>
  );
}

function ModeCard({ name, standing, top, onSelect }: ModeCardProps) {
  return (
    <button
      type="button"
      data-testid="mode-row"
      onClick={onSelect}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 10,
        textAlign: 'left',
        padding: '12px 12px 11px',
        minHeight: 104,
        borderRadius: 14,
        border: '1px solid var(--line-strong)',
        background: 'rgba(20,17,28,0.68)',
        cursor: 'pointer',
      }}
    >
      <StandingBadge standing={standing} />
      <span
        style={{
          paddingRight: 46,
          color: 'var(--ink-0)',
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 19,
          fontWeight: 700,
          lineHeight: 1.12,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {name}
      </span>
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12,
          minWidth: 0,
        }}
      >
        {top ? (
          <>
            <span aria-hidden style={{ fontSize: 13 }}>{countryToFlag(top.country)}</span>
            <span style={{ flex: 1, color: 'var(--ink-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {top.name}
            </span>
            <ScoreValue score={top.score} fontSize={13} />
          </>
        ) : (
          <span style={{ flex: 1, color: 'var(--ink-1)' }}>Be the first!</span>
        )}
      </span>
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
          flex: '1 1 auto',
          minHeight: 0,
          overflowY: 'auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: 10,
          alignContent: 'start',
        }}
      >
        {views === null ? (
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'center', padding: 24 }}>
            <span className="spinner" />
          </div>
        ) : views.length === 0 ? (
          <p data-testid="modes-empty" style={{ gridColumn: '1 / -1', color: 'var(--ink-1)', fontSize: 14, textAlign: 'center', margin: 0 }}>
            No modes yet — create one below.
          </p>
        ) : (
          views.map(({ mode, standing, top }) => (
            <ModeCard key={mode.id} name={mode.name} standing={standing} top={top} onSelect={() => onPick(mode)} />
          ))
        )}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.32, ease: 'easeOut' }}
        style={{ flexShrink: 0, paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <button type="button" data-testid="create-mode-btn" className="ember-btn" onClick={onCreate} style={{ width: '100%' }}>
          Create Mode
        </button>
      </motion.div>
    </motion.div>
  );
}
