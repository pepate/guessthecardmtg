import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { PullToRefresh } from './PullToRefresh';
import type { GlobalEntry } from '../leaderboard/types';
import type { RevealMode } from '../engine/timeAttack';
import type { CustomFilter } from '../modes/filter';
import type { Run } from '../leaderboard/boards';
import { fetchRevealLeaders, fetchModeRuns } from '../leaderboard/client';
import { fetchEnabledRevealModes } from '../reveal/client';
import { REVEAL_MODE_LABELS } from '../reveal/labels';
import { formatAge } from '../leaderboard/age';
import { findExistingMode, createMode } from '../modes/client';
import { useGameStore } from '../state/gameStore';
import { ScoreValue } from './ScoreValue';
import { countryToFlag } from '../leaderboard/flag';
import { FilterChips } from './FilterChips';
import { RevealIcon } from './RevealIcon';
import { RevealPreview } from './RevealPreview';

export interface PendingRowInfo {
  rank: number;
  /** Player's name, or null → render a tappable LOGIN instead. */
  name: string | null;
  score: number;
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
  /** Daily Set: remaining plays today. When 0, even the locked reveal is disabled. */
  playsLeft?: number;
  /** Daily Set: replay the locked reveal. Shown as a bottom "Play again" button. */
  onPlayAgain?: () => void;
}

const PENDING_ID = '__pending__';

export function ModeDetail({ modeId, modeName, filter, cardCount, pendingRow, lockedReveal, playsLeft, onPlayAgain }: ModeDetailProps) {
  const [leaders, setLeaders] = useState<Record<RevealMode, GlobalEntry | null> | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [enabled, setEnabled] = useState<RevealMode[] | null>(null);
  const [confirm, setConfirm] = useState<RevealMode | null>(null);
  const [tab, setTab] = useState<'leaderboard' | 'recent'>('leaderboard');
  const [expanded, setExpanded] = useState(false);

  const touchDevice = () => typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches;

  const load = useCallback(async () => {
    try {
      const en = await fetchEnabledRevealModes();
      setEnabled(en);
      if (!modeId) {
        setLeaders({} as Record<RevealMode, GlobalEntry | null>);
        setRuns([]);
        return;
      }
      const [lead, modeRuns] = await Promise.all([fetchRevealLeaders(modeId), fetchModeRuns(modeId)]);
      setLeaders(lead);
      setRuns(modeRuns);
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
  const byScore = [...played].sort((a, b) => b.score - a.score || a.createdAt - b.createdAt);
  const byRecent = [...played].sort((a, b) => b.createdAt - a.createdAt);

  const pendingSynthetic: Run | null = pendingRow
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

  const leaderboardList = pendingSynthetic
    ? [
        ...byScore.slice(0, Math.max(0, pendingRow!.rank - 1)),
        pendingSynthetic,
        ...byScore.slice(Math.max(0, pendingRow!.rank - 1)),
      ]
    : byScore;
  const recentList = pendingSynthetic ? [pendingSynthetic, ...byRecent] : byRecent;
  const activeList = tab === 'leaderboard' ? leaderboardList : recentList;
  const shown = expanded ? activeList : activeList.slice(0, PAGE);
  const hasMore = activeList.length > PAGE && !expanded;

  function switchTab(next: 'leaderboard' | 'recent') {
    setTab(next);
    setExpanded(false);
  }

  const hasList = played.length > 0 || !!pendingSynthetic;

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
                    <span style={{ flex: '0 0 auto', color: 'var(--ink-2)', fontSize: 11 }}>
                      {REVEAL_MODE_LABELS[pendingRow.gameMode]}
                    </span>
                    <ScoreValue score={pendingRow.score} fontSize={12} />
                  </div>
                );
              }
              return (
                <button
                  key={r.id}
                  type="button"
                  data-testid="game-row"
                  onClick={() => r.gameMode && choose(r.gameMode)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
                    padding: '8px 12px', borderRadius: 10, border: '1px solid var(--line)',
                    background: 'rgba(20,17,28,0.45)', cursor: 'pointer',
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                  }}
                >
                  {tab === 'leaderboard' && (
                    <span style={{ flex: '0 0 auto', color: 'var(--ink-2)', width: 22 }}>#{i + 1}</span>
                  )}
                  <span aria-hidden>{countryToFlag(r.country)}</span>
                  <span style={{ flex: 1, minWidth: 0, color: 'var(--ink-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                  <span style={{ flex: '0 0 auto', color: 'var(--ink-2)', fontSize: 11 }}>
                    {[r.gameMode ? REVEAL_MODE_LABELS[r.gameMode] : null, formatAge(r.createdAt, now)]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  <ScoreValue score={r.score} fontSize={12} />
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

        <p style={{ margin: '2px 0 0', color: 'var(--ink-2)', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
          {lockedReveal != null
            ? `Daily Set · only ${REVEAL_MODE_LABELS[lockedReveal]} counts today`
            : 'Pick a reveal mode · beat the holder'}
        </p>

        <div data-testid="reveal-list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {enabled === null ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
              <span className="spinner" />
            </div>
          ) : (
            enabled.map((reveal) => {
              const leader = leaders?.[reveal] ?? null;
              // Daily Set: only the locked reveal is playable, and only while plays remain.
              const rowDisabled = lockedReveal != null && (reveal !== lockedReveal || (playsLeft ?? 0) <= 0);
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
                  <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--ink-2)', minWidth: 0 }}>
                    {leader ? (
                      <>
                        <span aria-hidden>{countryToFlag(leader.country)}</span>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{leader.name}</span>
                        <span style={{ flex: '0 0 auto', color: 'var(--ink-2)', fontSize: 11 }}>{formatAge(leader.createdAt, now)}</span>
                        <ScoreValue score={leader.score} fontSize={13} />
                      </>
                    ) : (
                      <span style={{ flex: 1 }}>open · no scores</span>
                    )}
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

        {lockedReveal != null && onPlayAgain && (playsLeft ?? 0) > 0 && (
          <button
            type="button"
            className="ember-btn"
            data-testid="daily-play-again"
            onClick={onPlayAgain}
            style={{ width: '100%', padding: '13px 0', fontSize: 16, marginTop: 4 }}
          >
            Play again ({playsLeft} left)
          </button>
        )}
        </div>
       </PullToRefresh>
      </div>

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
