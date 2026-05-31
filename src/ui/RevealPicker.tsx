import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { CustomMode } from '../modes/types';
import type { GlobalEntry } from '../leaderboard/types';
import type { RevealMode } from '../engine/timeAttack';
import { fetchRevealLeaders, fetchModeRuns } from '../leaderboard/client';
import type { Run } from '../leaderboard/boards';
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
  const [idleHint, setIdleHint] = useState<string | null>(null);
  const [tab, setTab] = useState<'leaderboard' | 'recent'>('leaderboard');
  const [expanded, setExpanded] = useState(false);

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

  const now = Date.now();
  const PAGE = 8;

  // Every recorded run in this mode, ordered for each tab. Leaderboard = by score
  // (ties to the earlier run); Recent = newest first.
  const played = runs.filter((r) => r.gameMode);
  const byScore = [...played].sort((a, b) => b.score - a.score || a.createdAt - b.createdAt);
  const byRecent = [...played].sort((a, b) => b.createdAt - a.createdAt);
  const activeList = tab === 'leaderboard' ? byScore : byRecent;
  const shown = expanded ? activeList : activeList.slice(0, PAGE);
  const hasMore = activeList.length > PAGE && !expanded;

  function switchTab(next: 'leaderboard' | 'recent') {
    setTab(next);
    setExpanded(false);
  }

  // Tappable rows the idle nudge can point at — visible list rows first, then
  // reveal modes. Join into a stable string so the idle effect doesn't re-arm
  // every render (shown/enabled are fresh arrays each pass).
  const idleKey = useMemo(
    () => [...shown.map((r) => `row:${r.id}`), ...(enabled ?? []).map((rv) => `reveal:${rv}`)].join('|'),
    [shown, enabled],
  );

  // After 10s of no input, pulse a random row to show it's tappable; any
  // interaction clears the hint and restarts the idle countdown.
  useEffect(() => {
    const candidates = idleKey ? idleKey.split('|') : [];
    if (candidates.length === 0 || confirm) return;
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(timer);
      setIdleHint(null);
      timer = setTimeout(() => {
        setIdleHint(candidates[Math.floor(Math.random() * candidates.length)]);
      }, 10000);
    };
    arm();
    window.addEventListener('pointerdown', arm);
    window.addEventListener('pointermove', arm);
    window.addEventListener('keydown', arm);
    window.addEventListener('wheel', arm);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', arm);
      window.removeEventListener('pointermove', arm);
      window.removeEventListener('keydown', arm);
      window.removeEventListener('wheel', arm);
    };
  }, [idleKey, confirm]);

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

        {played.length > 0 && (
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
            {shown.map((r, i) => (
              <button
                key={r.id}
                type="button"
                data-testid="game-row"
                className={idleHint === `row:${r.id}` ? 'idle-hint' : undefined}
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
                  {r.gameMode ? REVEAL_MODE_LABELS[r.gameMode] : ''}
                  {tab === 'recent' ? ` · ${formatAge(r.createdAt, now)}` : ''}
                </span>
                <ScoreValue score={r.score} fontSize={12} />
              </button>
            ))}
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
                className={idleHint === `reveal:${reveal}` ? 'idle-hint' : undefined}
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
