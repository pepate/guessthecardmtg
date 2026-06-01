import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { listModes } from '../modes/client';
import { startMostPlayedGame, startRandomGame } from '../modes/quickStart';
import type { CustomMode, CustomModeListItem } from '../modes/types';
import { fetchModeRuns } from '../leaderboard/client';
import { deviceModeStanding, type Run } from '../leaderboard/boards';
import { getUserId } from '../leaderboard/identity';
import { getProfile } from '../profile/client';
import { getGamesPlayed } from '../state/highscores';
import { windowCutoff, WINDOW_TABS, type TimeWindow } from '../leaderboard/window';
import { ScoreValue } from './ScoreValue';
import { countryToFlag } from '../leaderboard/flag';
import { DailySet } from './DailySet';

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

// The player's own rank in this mode for the selected time window. Shown only
// when they actually have a placement (i.e. they're signed in with a name and
// posted a run in this window) — otherwise nothing is shown (no "new" badge).
function RankBadge({ standing }: { standing: number | null }) {
  if (standing === null) return null;
  const first = standing === 1;
  return (
    <span
      data-testid="own-rank"
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
        border: `1px solid ${first ? 'var(--ember)' : 'var(--line-strong)'}`,
        background: first ? 'rgba(255,138,60,0.22)' : 'rgba(255,186,120,0.10)',
        color: first ? 'var(--ember-hot)' : 'var(--ink-0)',
      }}
    >
      #{standing}
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
  onNeedAccount,
}: {
  onPick: (mode: CustomMode) => void;
  onCreate: () => void;
  /** Tapped Create without an account yet → route to the profile to claim a name. */
  onNeedAccount: () => void;
}) {
  const [win, setWin] = useState<TimeWindow>('today');
  const [views, setViews] = useState<ModeView[] | null>(null);
  const [fabOpen, setFabOpen] = useState(false);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [gamesPlayed] = useState(() => getGamesPlayed());
  // Creating modes requires an account (a claimed display name). The button stays
  // tappable while greyed out so a nameless player is routed to the profile.
  const [hasName, setHasName] = useState(false);

  const touchDevice = () => typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const uid = await getUserId();
      const profile = uid ? await getProfile(uid).catch(() => null) : null;
      if (!cancelled) setHasName(!!profile?.displayName);
    })().catch(() => {});
    return () => { cancelled = true; };
  }, []);

  function onFabClick() {
    // Touch devices have no hover: first tap reveals the label, the next acts.
    if (touchDevice() && !fabOpen) {
      setFabOpen(true);
      return;
    }
    // No account yet → send them to the profile to claim a name first.
    if (!hasName) {
      setFabOpen(false);
      onNeedAccount();
      return;
    }
    onCreate();
  }

  async function onAdvanceClick() {
    if (touchDevice() && !advanceOpen) {
      setAdvanceOpen(true);
      return;
    }
    await startRandomGame();
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

  return (
    <motion.div
      key="modes"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="bottom-sheet"
      style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '92%' }}
    >
      <div style={{ ...centered, flexShrink: 0 }}>
        <DailySet />
      </div>

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
          onClick={() => void startMostPlayedGame()}
          style={{ alignSelf: 'center', flexShrink: 0, padding: '11px 32px', fontSize: 15 }}
        >
          Quick Game
        </button>
      )}

      {views && views.length > 0 && (
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
        aria-disabled={!hasName}
        className={`fab create-fab${fabOpen ? ' is-open' : ''}`}
        onClick={onFabClick}
        style={!hasName ? { opacity: 0.45 } : undefined}
      >
        <span className="fab-plus" aria-hidden>+</span>
        <span className="fab-label">Create Mode</span>
      </button>
    </motion.div>
  );
}
