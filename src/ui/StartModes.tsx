import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { listModes, getModeById } from '../modes/client';
import type { CustomMode, CustomModeListItem } from '../modes/types';
import { fetchModeRuns, fetchAutoAdvanceTarget } from '../leaderboard/client';
import { deviceModeStanding, type Run } from '../leaderboard/boards';
import { getUserId } from '../leaderboard/identity';
import { fetchEnabledRevealModes } from '../reveal/client';
import { useGameStore } from '../state/gameStore';
import { getGamesPlayed } from '../state/highscores';
import type { RevealMode } from '../engine/timeAttack';
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
  const [win, setWin] = useState<TimeWindow>('week');
  const [views, setViews] = useState<ModeView[] | null>(null);
  const [fabOpen, setFabOpen] = useState(false);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [nextTarget, setNextTarget] = useState<{ modeId: string; reveal: RevealMode } | null>(null);
  const [createHint, setCreateHint] = useState(false);
  const [gamesPlayed] = useState(() => getGamesPlayed());
  const GAMES_TO_UNLOCK = 3;

  const touchDevice = () => typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches;

  function onFabClick() {
    // Touch devices have no hover: first tap reveals the label, the next creates.
    if (touchDevice() && !fabOpen) {
      setFabOpen(true);
      return;
    }
    // Gate creation until the player has finished a few games.
    if (gamesPlayed < GAMES_TO_UNLOCK) {
      setFabOpen(false);
      setCreateHint(true);
      return;
    }
    onCreate();
  }

  async function onAdvanceClick() {
    if (touchDevice() && !advanceOpen) {
      setAdvanceOpen(true);
      return;
    }
    if (!nextTarget) return;
    const mode = await getModeById(nextTarget.modeId);
    if (!mode) return;
    const store = useGameStore.getState();
    store.setRevealChoice(nextTarget.reveal);
    void store.selectPool({ kind: 'custom', modeId: mode.id, filter: mode.filter, name: mode.name });
  }

  // Auto-collapse the expanded mobile FABs so they don't sit over the list.
  useEffect(() => {
    if (!fabOpen) return;
    const id = setTimeout(() => setFabOpen(false), 3000);
    return () => clearTimeout(id);
  }, [fabOpen]);
  useEffect(() => {
    if (!advanceOpen) return;
    const id = setTimeout(() => setAdvanceOpen(false), 3000);
    return () => clearTimeout(id);
  }, [advanceOpen]);
  useEffect(() => {
    if (!createHint) return;
    const id = setTimeout(() => setCreateHint(false), 3800);
    return () => clearTimeout(id);
  }, [createHint]);

  // The next highscore worth chasing across all modes (none → no advance FAB).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const modes = await listModes(200);
      const enabled = await fetchEnabledRevealModes();
      const uid = await getUserId();
      if (!uid) return;
      const target = await fetchAutoAdvanceTarget(modes.map((m) => m.id), uid, enabled);
      if (!cancelled) setNextTarget(target);
    })().catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setViews(null);
    (async () => {
      const modes = await listModes(200);
      // No session yet → empty id matches no rows, so standings are simply absent
      // while the mode list still renders for everyone.
      const device = (await getUserId()) ?? '';
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

  // First-timers (no games yet) get a one-tap start into the most-played mode,
  // so they land in a populated game with a real leaderboard rather than an empty one.
  function quickGame() {
    if (!views || views.length === 0) return;
    const target = views.reduce((a, b) => (b.mode.entry_count > a.mode.entry_count ? b : a)).mode;
    const store = useGameStore.getState();
    store.setRevealChoice('blur');
    void store.selectPool({ kind: 'custom', modeId: target.id, filter: target.filter, name: target.name });
  }

  return (
    <motion.div
      key="modes"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="bottom-sheet"
      style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '92%' }}
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
          paddingBottom: 160,
        }}
      >
        {views === null ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
            <span className="spinner" />
          </div>
        ) : views.length === 0 ? (
          <p data-testid="modes-empty" style={{ color: 'var(--ink-1)', fontSize: 14, textAlign: 'center', margin: 0 }}>
            No modes yet — tap + to create one.
          </p>
        ) : (
          views.map(({ mode, standing, top }) => (
            <ModeRow key={mode.id} name={mode.name} standing={standing} top={top} plays={mode.entry_count} onSelect={() => onPick(mode)} />
          ))
        )}
      </div>

      {gamesPlayed === 0 && views && views.length > 0 && (
        <button
          type="button"
          className="ember-btn"
          data-testid="quick-game"
          onClick={quickGame}
          style={{ ...centered, flexShrink: 0, padding: '15px 0', fontSize: 17 }}
        >
          Quick Game
        </button>
      )}

      {createHint && (
        <div
          data-testid="create-hint"
          style={{
            position: 'fixed',
            right: 16,
            bottom: 'calc(160px + env(safe-area-inset-bottom))',
            zIndex: 7,
            maxWidth: 250,
            padding: '10px 14px',
            borderRadius: 12,
            border: '1px solid var(--line-strong)',
            background: 'rgba(13,11,19,0.95)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            color: 'var(--ink-1)',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            lineHeight: 1.45,
            boxShadow: '0 8px 22px rgba(0,0,0,0.5)',
          }}
        >
          Play {GAMES_TO_UNLOCK - gamesPlayed} more {GAMES_TO_UNLOCK - gamesPlayed === 1 ? 'game' : 'games'} before you create your own mode.
        </div>
      )}

      {nextTarget && (
        <button
          type="button"
          data-testid="advance-fab"
          aria-label="Random game"
          className={`fab advance-fab${advanceOpen ? ' is-open' : ''}`}
          onClick={onAdvanceClick}
        >
          <span className="fab-plus" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 3 21 3 21 8" />
              <line x1="4" y1="20" x2="21" y2="3" />
              <polyline points="21 16 21 21 16 21" />
              <line x1="15" y1="15" x2="21" y2="21" />
              <line x1="4" y1="4" x2="9" y2="9" />
            </svg>
          </span>
          <span className="fab-label">Random game</span>
        </button>
      )}

      <button
        type="button"
        data-testid="create-mode-btn"
        aria-label="Create Mode"
        className={`fab create-fab${fabOpen ? ' is-open' : ''}`}
        onClick={onFabClick}
      >
        <span className="fab-plus" aria-hidden>+</span>
        <span className="fab-label">Create Mode</span>
      </button>
    </motion.div>
  );
}
