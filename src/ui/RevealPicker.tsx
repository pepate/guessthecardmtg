import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { CustomMode } from '../modes/types';
import type { GlobalEntry } from '../leaderboard/types';
import type { RevealMode } from '../engine/timeAttack';
import { fetchRevealLeaders, fetchModeRuns } from '../leaderboard/client';
import { comboBoard, type Run } from '../leaderboard/boards';
import { fetchEnabledRevealModes } from '../reveal/client';
import { REVEAL_MODE_LABELS } from '../reveal/labels';
import { formatAge } from '../leaderboard/age';
import { useGameStore } from '../state/gameStore';
import { ScoreValue } from './ScoreValue';
import { countryToFlag } from '../leaderboard/flag';
import { buildDeeplink } from '../share/deeplink';
import { FilterChips } from './FilterChips';

export function RevealPicker({ mode }: { mode: CustomMode }) {
  const [leaders, setLeaders] = useState<Record<RevealMode, GlobalEntry | null> | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [enabled, setEnabled] = useState<RevealMode[] | null>(null);
  const [copied, setCopied] = useState<RevealMode | null>(null);
  const [confirm, setConfirm] = useState<RevealMode | null>(null);

  const touchDevice = () => typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches;

  async function share(reveal: RevealMode) {
    const url = buildDeeplink(mode.id, reveal);
    const title = `${mode.name} · ${REVEAL_MODE_LABELS[reveal]} — beat my score!`;
    try {
      if (navigator.share) {
        await navigator.share({ url, title });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(reveal);
        setTimeout(() => setCopied((c) => (c === reveal ? null : c)), 1500);
      }
    } catch {
      /* user dismissed the share sheet — ignore */
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [lead, en, modeRuns] = await Promise.all([
        fetchRevealLeaders(mode.id),
        fetchEnabledRevealModes(),
        fetchModeRuns(mode.id),
      ]);
      if (cancelled) return;
      setLeaders(lead);
      setEnabled(en);
      setRuns(modeRuns);
    })().catch(() => {
      if (!cancelled) setEnabled([]);
    });
    return () => {
      cancelled = true;
    };
  }, [mode.id]);

  function play(reveal: RevealMode) {
    const store = useGameStore.getState();
    store.setRevealChoice(reveal);
    void store.selectPool({ kind: 'custom', modeId: mode.id, filter: mode.filter, name: mode.name });
  }

  // On touch, confirm with a big tap target first; on desktop start directly.
  function choose(reveal: RevealMode) {
    if (touchDevice()) setConfirm(reveal);
    else play(reveal);
  }

  // The most recent recorded runs in this mode (newest first), for quick replay.
  const now = Date.now();
  const recent = runs
    .filter((r) => r.gameMode)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 3);

  // Rank a score holds on its reveal board (distinct devices scoring higher).
  const rankOf = (reveal: RevealMode, score: number): number =>
    comboBoard(runs, reveal).filter((e) => e.score > score).length + 1;

  return (
    <motion.div
      key="picker"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="bottom-sheet"
      style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '92%' }}
    >
      <div style={{ width: '100%', maxWidth: 700, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, paddingRight: 96 }}>
        <span style={{ flex: 1, color: 'var(--ink-0)', fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {mode.name}
        </span>
      </div>

      <div style={{ width: '100%', maxWidth: 700, margin: '0 auto', flex: '1 1 auto', minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <FilterChips filter={mode.filter} />
          <div style={{ textAlign: 'center', color: 'var(--ink-2)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
            {mode.card_count.toLocaleString()} cards
          </div>
        </div>

        {recent.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ color: 'var(--ink-2)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>Recent games</span>
            {recent.map((r) => (
              <button
                key={r.id}
                type="button"
                data-testid="recent-game"
                onClick={() => r.gameMode && choose(r.gameMode)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
                  padding: '8px 12px', borderRadius: 10, border: '1px solid var(--line)',
                  background: 'rgba(20,17,28,0.45)', cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                }}
              >
                <span aria-hidden>{countryToFlag(r.country)}</span>
                <span style={{ flex: 1, minWidth: 0, color: 'var(--ink-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                <span style={{ flex: '0 0 auto', color: 'var(--ink-2)', fontSize: 11 }}>
                  {r.gameMode ? REVEAL_MODE_LABELS[r.gameMode] : ''} · #{rankOf(r.gameMode!, r.score)} · {formatAge(r.createdAt, now)}
                </span>
                <ScoreValue score={r.score} fontSize={12} />
              </button>
            ))}
          </div>
        )}

        <p style={{ margin: '2px 0 0', color: 'var(--ink-2)', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
          Pick a reveal mode · beat the holder
        </p>

        <div data-testid="reveal-list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {enabled === null ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
            <span className="spinner" />
          </div>
        ) : (
          enabled.map((reveal) => {
            const leader = leaders?.[reveal] ?? null;
            return (
              <div
                key={reveal}
                data-testid="reveal-row"
                data-reveal={reveal}
                role="button"
                onClick={() => choose(reveal)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  textAlign: 'left',
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: '1px solid var(--line-strong)',
                  background: 'rgba(20,17,28,0.6)',
                  cursor: 'pointer',
                }}
              >
                <span style={{ width: 92, color: 'var(--ink-0)', fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 700 }}>
                  {REVEAL_MODE_LABELS[reveal]}
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
                <button
                  type="button"
                  data-testid="reveal-share"
                  aria-label={`Share ${REVEAL_MODE_LABELS[reveal]} challenge`}
                  onClick={(e) => {
                    e.stopPropagation();
                    void share(reveal);
                  }}
                  style={{
                    flexShrink: 0,
                    background: 'transparent',
                    border: '1px solid var(--line)',
                    borderRadius: 8,
                    color: copied === reveal ? 'var(--ember-hot)' : 'var(--ink-2)',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10,
                    padding: '5px 8px',
                    cursor: 'pointer',
                  }}
                >
                  {copied === reveal ? 'copied' : 'share'}
                </button>
              </div>
            );
          })
        )}
        </div>
      </div>

      {confirm && (
        <div
          data-testid="play-confirm"
          onClick={() => setConfirm(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            background: 'rgba(5,4,8,0.8)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
          }}
        >
          <button
            type="button"
            data-testid="play-confirm-btn"
            className="ember-btn"
            onClick={(e) => { e.stopPropagation(); play(confirm); }}
            style={{ width: '100%', maxWidth: 420, minHeight: 76, fontSize: 24 }}
          >
            Play {REVEAL_MODE_LABELS[confirm]}
          </button>
        </div>
      )}
    </motion.div>
  );
}
