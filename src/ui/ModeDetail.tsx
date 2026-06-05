import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { PullToRefresh } from './PullToRefresh';
import type { GlobalEntry } from '../leaderboard/types';
import type { RevealMode } from '../engine/timeAttack';
import type { CustomFilter } from '../modes/filter';
import { summedBoard, ownBestPerReveal, summedRank, type Run } from '../leaderboard/boards';
import { getUserId } from '../leaderboard/identity';
import { fetchModeRuns } from '../leaderboard/client';
import { fetchEnabledRevealModes } from '../reveal/client';
import { REVEAL_MODE_LABELS } from '../reveal/labels';
import { formatAge } from '../leaderboard/age';
import { findExistingMode, createMode } from '../modes/client';
import { useGameStore } from '../state/gameStore';
import { ScoreValue } from './ScoreValue';
import { countryToFlag } from '../leaderboard/flag';
import { modeShareLink } from '../share/score';
import { FilterChips } from './FilterChips';
import { RevealIcon } from './RevealIcon';
import { RevealPreview } from './RevealPreview';

export interface PendingRowInfo {
  rank: number;
  /** Player's name, or null → render a tappable LOGIN instead. */
  name: string | null;
  /** This run's single-game score (shown in the Recent tab). */
  score: number;
  /** Projected pool total across reveals (shown in the Leaderboard tab). */
  total: number;
  correct: number;
  gameMode: RevealMode;
  onLogin: () => void;
}

interface ModeDetailProps {
  modeId: string | null;
  modeName: string;
  filter: CustomFilter;
  cardCount?: number;
  pendingRow?: PendingRowInfo | null;
  /** Daily Set game-over: only this reveal is playable; the others are disabled. */
  lockedReveal?: RevealMode | null;
  /** Daily Set: replay the locked reveal. Shown as a bottom "Play again" button. */
  onPlayAgain?: () => void;
  /** When set, renders an always-visible Back button pinned below the list. */
  onBack?: () => void;
  /** Game-over: pinned bottom button → back to the start list. */
  onHome?: () => void;
  /** Game-over: pinned bottom button → this mode's picker page. */
  onBackToMode?: () => void;
}

const PENDING_ID = '__pending__';

export function ModeDetail({ modeId, modeName, filter, cardCount, pendingRow, lockedReveal, onPlayAgain, onBack, onHome, onBackToMode }: ModeDetailProps) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [enabled, setEnabled] = useState<RevealMode[] | null>(null);
  const [confirm, setConfirm] = useState<RevealMode | null>(null);
  const [tab, setTab] = useState<'leaderboard' | 'recent'>('leaderboard');
  const [expanded, setExpanded] = useState(false);
  const [shared, setShared] = useState(false);

  const touchDevice = () => typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches;

  const load = useCallback(async () => {
    try {
      const en = await fetchEnabledRevealModes();
      setEnabled(en);
      const uid = await getUserId().catch(() => null);
      setDeviceId(uid ?? '');
      if (!modeId) { setRuns([]); return; }
      setRuns(await fetchModeRuns(modeId));
    } catch {
      setEnabled([]);
    }
  }, [modeId]);

  useEffect(() => { void load(); }, [load]);

  // Replay this mode at `reveal`. The mode id is usually known; for a not-yet-created
  // mode (e.g. an unplayed set reached via game-over) resolve/create it by filter first.
  async function play(reveal: RevealMode) {
    const store = useGameStore.getState();
    store.setRevealChoice(reveal);
    let id = modeId;
    if (!id) {
      const existing = await findExistingMode(filter).catch(() => null);
      if (existing) {
        id = existing.id;
      } else {
        const created = await createMode(filter).catch(() => null);
        id = created && created.ok ? created.mode.id : null;
      }
    }
    if (!id) return;
    void store.selectPool({ kind: 'custom', modeId: id, filter, name: modeName });
  }

  // Both touch and desktop get a preview before playing — touch as a full-bleed
  // sheet, desktop as a centered modal popup.
  function choose(reveal: RevealMode) {
    setConfirm(reveal);
  }

  // Desktop modals close on Escape.
  useEffect(() => {
    if (!confirm) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setConfirm(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirm]);

  const now = Date.now();
  const PAGE = 3;

  const played = runs.filter((r) => r.gameMode);
  const byRecent = [...played].sort((a, b) => b.createdAt - a.createdAt);

  const board = summedBoard(runs);
  const myRank = summedRank(board, deviceId);
  const myTotal = board.find((e) => e.deviceId === deviceId)?.score ?? 0;
  const own = ownBestPerReveal(runs, deviceId);
  // Distinct enabled reveals the device has a score in (the count that feeds the total).
  const playedReveals = (enabled ?? []).filter((r) => own.has(r)).length;

  // Share this mode: link opens the mode's picker; the preview shows my total.
  async function shareMode() {
    if (!modeId) return;
    const url = modeShareLink({ modeId, modeName, score: myTotal });
    const text = `My total in ${modeName} is ${myTotal} on GuessTheCard — can you beat me?`;
    try {
      if (navigator.share) { await navigator.share({ title: 'GuessTheCard', text, url }); return; }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch {
      // dismissed or blocked — no-op
    }
  }
  const revealsSorted = [...(enabled ?? [])].sort(
    (a, b) => (own.get(b) ?? 0) - (own.get(a) ?? 0) || REVEAL_MODE_LABELS[a].localeCompare(REVEAL_MODE_LABELS[b]),
  );

  // Recent tab still shows individual runs; a synthetic pending Run is prepended.
  const pendingRun: Run | null = pendingRow
    ? {
        id: PENDING_ID,
        name: pendingRow.name ?? '',
        score: pendingRow.score,
        correct: pendingRow.correct,
        gameMode: pendingRow.gameMode,
        deviceId: PENDING_ID,
        country: null,
        createdAt: now,
      }
    : null;
  const recentList = pendingRun ? [pendingRun, ...byRecent] : byRecent;

  // Leaderboard tab shows the summed board; a synthetic pending entry is spliced
  // in at the projected rank index.
  const pendingEntry: GlobalEntry | null = pendingRow
    ? {
        id: PENDING_ID,
        name: pendingRow.name ?? '',
        score: pendingRow.total,
        correct: pendingRow.correct,
        gameModes: [],
        country: null,
        createdAt: now,
        deviceId: PENDING_ID,
      }
    : null;
  // The pending entry IS this device's projected total, so drop the device's
  // already-persisted row before splicing it in — otherwise the player shows up
  // twice (projected + persisted) until a reload merges them.
  const boardSansSelf =
    pendingEntry && deviceId ? board.filter((e) => e.deviceId !== deviceId) : board;
  const pendingIdx = Math.max(0, (pendingRow?.rank ?? 1) - 1);
  const leaderboardEntries: GlobalEntry[] = pendingEntry
    ? [...boardSansSelf.slice(0, pendingIdx), pendingEntry, ...boardSansSelf.slice(pendingIdx)]
    : board;

  const activeList: (Run | GlobalEntry)[] = tab === 'leaderboard' ? leaderboardEntries : recentList;
  const shown = expanded ? activeList : activeList.slice(0, PAGE);
  const hasMore = activeList.length > PAGE && !expanded;

  function switchTab(next: 'leaderboard' | 'recent') {
    setTab(next);
    setExpanded(false);
  }

  const hasList = played.length > 0 || !!pendingRow;

  return (
    <motion.div
      key="picker"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="bottom-sheet"
      style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '92%' }}
    >
      <div style={{ width: '100%', maxWidth: 700, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, paddingRight: 96 }}>
        <span style={{ flex: 1, color: 'var(--ink-0)', fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {modeName}
        </span>
      </div>

      <div style={{ width: '100%', maxWidth: 700, margin: '0 auto', flex: '1 1 auto', minHeight: 0 }}>
       <PullToRefresh onRefresh={load}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <FilterChips filter={filter} />
          {cardCount != null && (
            <div style={{ textAlign: 'center', color: 'var(--ink-2)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
              {cardCount.toLocaleString()} cards
            </div>
          )}
        </div>

        {hasList && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['leaderboard', 'recent'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  data-testid={`picker-tab-${t}`}
                  aria-pressed={tab === t}
                  onClick={() => switchTab(t)}
                  style={{
                    flex: 1,
                    padding: '7px 10px',
                    borderRadius: 8,
                    border: `1px solid ${tab === t ? 'var(--ember)' : 'var(--line)'}`,
                    background: tab === t ? 'rgba(255,122,44,0.12)' : 'rgba(20,17,28,0.45)',
                    color: tab === t ? 'var(--ember-hot)' : 'var(--ink-2)',
                    cursor: 'pointer',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                  }}
                >
                  {t === 'leaderboard' ? 'Leaderboard' : 'Recent games'}
                </button>
              ))}
            </div>
            {shown.map((r, i) => {
              if (r.id === PENDING_ID && pendingRow) {
                return (
                  <div
                    key={PENDING_ID}
                    data-testid="pending-run-row"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
                      padding: '8px 12px', borderRadius: 10, border: '1px solid var(--ember)',
                      background: 'rgba(255,138,60,0.18)',
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                    }}
                  >
                    {tab === 'leaderboard' && (
                      <span style={{ flex: '0 0 auto', color: 'var(--ink-2)', width: 22 }}>#{pendingRow.rank}</span>
                    )}
                    <span aria-hidden>{countryToFlag(null)}</span>
                    {pendingRow.name == null ? (
                      <button
                        type="button"
                        data-testid="pending-login"
                        onClick={pendingRow.onLogin}
                        style={{
                          flex: 1, minWidth: 0, textAlign: 'left', background: 'transparent',
                          border: 'none', cursor: 'pointer', color: 'var(--ember-hot)',
                          fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: 1,
                          textTransform: 'uppercase', padding: 0,
                        }}
                      >
                        Login
                      </button>
                    ) : (
                      <span style={{ flex: 1, minWidth: 0, color: 'var(--ink-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {pendingRow.name}
                      </span>
                    )}
                    {tab === 'recent' && (
                      <span style={{ flex: '0 0 auto', color: 'var(--ink-2)', fontSize: 11 }}>
                        {REVEAL_MODE_LABELS[pendingRow.gameMode]}
                      </span>
                    )}
                    <ScoreValue score={tab === 'leaderboard' ? pendingRow.total : pendingRow.score} fontSize={12} />
                  </div>
                );
              }
              if (tab === 'leaderboard') {
                return (
                  <div
                    key={r.id}
                    data-testid="game-row"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
                      padding: '8px 12px', borderRadius: 10, border: '1px solid var(--line)',
                      background: 'rgba(20,17,28,0.45)',
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                    }}
                  >
                    <span style={{ flex: '0 0 auto', color: 'var(--ink-2)', width: 22 }}>#{i + 1}</span>
                    <span aria-hidden>{countryToFlag(r.country)}</span>
                    <span style={{ flex: 1, minWidth: 0, color: 'var(--ink-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                    <ScoreValue score={r.score} fontSize={12} />
                  </div>
                );
              }
              const run = r as Run;
              return (
                <button
                  key={run.id}
                  type="button"
                  data-testid="game-row"
                  onClick={() => run.gameMode && choose(run.gameMode)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
                    padding: '8px 12px', borderRadius: 10, border: '1px solid var(--line)',
                    background: 'rgba(20,17,28,0.45)', cursor: 'pointer',
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                  }}
                >
                  <span aria-hidden>{countryToFlag(run.country)}</span>
                  <span style={{ flex: 1, minWidth: 0, color: 'var(--ink-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{run.name}</span>
                  <span style={{ flex: '0 0 auto', color: 'var(--ink-2)', fontSize: 11 }}>
                    {[run.gameMode ? REVEAL_MODE_LABELS[run.gameMode] : null, formatAge(run.createdAt, now)]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  <ScoreValue score={run.score} fontSize={12} />
                </button>
              );
            })}
            {hasMore && (
              <button
                type="button"
                data-testid="picker-more"
                onClick={() => setExpanded(true)}
                style={{
                  padding: '7px 10px', borderRadius: 8, border: '1px solid var(--line)',
                  background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                }}
              >
                More ({activeList.length - PAGE})
              </button>
            )}
          </div>
        )}

        <div data-testid="your-standing" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--line-strong)', background: 'rgba(20,17,28,0.6)', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--ink-1)' }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span>Your standing</span>
            {enabled && enabled.length > 0 && (
              <span data-testid="standing-modes" style={{ color: 'var(--ink-2)', fontSize: 11, lineHeight: 1.3 }}>
                {playedReveals} / {enabled.length} reveals
                {playedReveals < enabled.length && ' · play more to raise your total'}
              </span>
            )}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {modeId && (
              <button
                type="button"
                data-testid="standing-share"
                aria-label={shared ? 'Link copied' : 'Share this mode'}
                title={shared ? 'Link copied' : 'Share this mode'}
                onClick={() => void shareMode()}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, padding: 0, borderRadius: 8,
                  border: '1px solid var(--line-strong)', background: 'rgba(20,17,28,0.6)',
                  color: shared ? 'var(--ember-hot)' : 'var(--ink-1)', cursor: 'pointer',
                }}
              >
                {shared ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
                    <line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
                  </svg>
                )}
              </button>
            )}
            <span style={{ color: 'var(--ember-hot)', fontWeight: 700 }}>{myRank != null ? `#${myRank}` : '—'}</span>
            <ScoreValue score={myTotal} fontSize={13} />
          </span>
        </div>

        <p style={{ margin: '2px 0 0', color: 'var(--ink-2)', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
          {lockedReveal != null
            ? `Daily Set · only ${REVEAL_MODE_LABELS[lockedReveal]} counts today`
            : 'Total = your best score in each reveal mode, summed'}
        </p>

        <div data-testid="reveal-list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {enabled === null ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
              <span className="spinner" />
            </div>
          ) : (
            revealsSorted.map((reveal) => {
              const rowDisabled = lockedReveal != null && reveal !== lockedReveal;
              return (
                <div
                  key={reveal}
                  data-testid="reveal-row"
                  data-reveal={reveal}
                  data-disabled={rowDisabled || undefined}
                  role="button"
                  aria-disabled={rowDisabled || undefined}
                  onClick={rowDisabled ? undefined : () => choose(reveal)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                    padding: '12px 14px', borderRadius: 12, border: '1px solid var(--line-strong)',
                    background: 'rgba(20,17,28,0.6)', cursor: rowDisabled ? 'default' : 'pointer',
                    opacity: rowDisabled ? 0.4 : 1,
                  }}
                >
                  <span style={{ flex: '0 0 auto', width: 30, display: 'flex', justifyContent: 'center' }}>
                    <RevealIcon reveal={reveal} />
                  </span>
                  <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--ink-1)', minWidth: 0 }}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{REVEAL_MODE_LABELS[reveal]}</span>
                    <ScoreValue score={own.get(reveal) ?? 0} fontSize={13} />
                  </span>
                  {!rowDisabled && (
                    <button
                      type="button"
                      data-testid="reveal-play"
                      aria-label={`Play ${REVEAL_MODE_LABELS[reveal]}`}
                      onClick={(e) => { e.stopPropagation(); choose(reveal); }}
                      style={{
                        flexShrink: 0, background: 'rgba(255,122,44,0.18)', border: '1px solid var(--ember)',
                        borderRadius: 8, color: 'var(--ember-hot)', fontWeight: 700,
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 11, padding: '6px 12px', cursor: 'pointer',
                      }}
                    >
                      Play
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {lockedReveal != null && onPlayAgain && (
          <button
            type="button"
            className="ember-btn"
            data-testid="daily-play-again"
            onClick={onPlayAgain}
            style={{ width: '100%', padding: '13px 0', fontSize: 16, marginTop: 4 }}
          >
            Play again
          </button>
        )}
        </div>
       </PullToRefresh>
      </div>

      {onBack && (
        <div style={{ width: '100%', maxWidth: 700, margin: '0 auto', flexShrink: 0 }}>
          <button
            type="button"
            className="ember-btn"
            data-testid="mode-detail-back"
            onClick={onBack}
            style={{ width: '100%', padding: '13px 0', fontSize: 16 }}
          >
            Back
          </button>
        </div>
      )}

      {(onHome || onBackToMode) && (
        <div style={{ width: '100%', maxWidth: 700, margin: '0 auto', flexShrink: 0, display: 'flex', gap: 10 }}>
          {onHome && (
            <button
              type="button"
              className="ghost-btn"
              data-testid="gameover-home-bottom"
              onClick={onHome}
              style={{ flex: 1, padding: '13px 0', fontSize: 16 }}
            >
              Home
            </button>
          )}
          {onBackToMode && (
            <button
              type="button"
              className="ember-btn"
              data-testid="gameover-back-to-mode"
              onClick={onBackToMode}
              style={{ flex: 1, padding: '13px 0', fontSize: 16 }}
            >
              Back to mode
            </button>
          )}
        </div>
      )}

      {confirm && (
        <div
          data-testid="play-confirm"
          onClick={() => setConfirm(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 20, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 20, padding: 24,
            background: 'rgba(5,4,8,0.8)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
          }}
        >
          {touchDevice() ? (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, width: '100%', maxWidth: 420 }}
            >
              <RevealPreview reveal={confirm} filter={filter} />
              <button
                type="button"
                data-testid="play-confirm-btn"
                className="ember-btn"
                onClick={(e) => { e.stopPropagation(); void play(confirm); }}
                style={{ width: '100%', minHeight: 76, fontSize: 24 }}
              >
                Play {REVEAL_MODE_LABELS[confirm]}
              </button>
            </div>
          ) : (
            <div
              data-testid="play-modal"
              onClick={(e) => e.stopPropagation()}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
                width: '100%', maxWidth: 320, padding: '20px 20px 22px',
                background: 'rgba(18,15,26,0.98)', border: '1px solid var(--line-strong)',
                borderRadius: 16, boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
              }}
            >
              <RevealPreview reveal={confirm} filter={filter} variant="desktop" />
              <button
                type="button"
                data-testid="play-confirm-btn"
                className="ember-btn"
                onClick={(e) => { e.stopPropagation(); void play(confirm); }}
                style={{ width: '100%', minHeight: 54, fontSize: 20 }}
              >
                Play {REVEAL_MODE_LABELS[confirm]}
              </button>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
