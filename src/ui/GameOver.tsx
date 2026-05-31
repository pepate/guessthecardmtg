import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../state/gameStore';
import { GameOverLeaderboard } from './GameOverLeaderboard';
import { shareLink } from '../share/score';
import type { RevealMode } from '../engine/timeAttack';
import { fetchRevealLeaders, isLeaderboardEnabled } from '../leaderboard/client';
import { fetchEnabledRevealModes } from '../reveal/client';
import { REVEAL_MODE_LABELS } from '../reveal/labels';
import type { GlobalEntry } from '../leaderboard/types';
import { ScoreValue } from './ScoreValue';
import { countryToFlag } from '../leaderboard/flag';

export function GameOver() {
  const correctCount = useGameStore((s) => s.correctCount);
  const totalScore = useGameStore((s) => s.totalScore);
  const poolKind = useGameStore((s) => s.poolKind);
  const currentModeId = useGameStore((s) => s.currentModeId);
  const currentModeName = useGameStore((s) => s.currentModeName);
  const currentModeFilter = useGameStore((s) => s.currentModeFilter);
  const gameMode = useGameStore((s) => s.gameMode);
  const roundIndex = useGameStore((s) => s.roundIndex);

  const [shareLabel, setShareLabel] = useState('Share score');
  const [otherLeaders, setOtherLeaders] = useState<Record<RevealMode, GlobalEntry | null> | null>(null);
  const [enabledModes, setEnabledModes] = useState<RevealMode[]>([]);

  // Top players in this mode's OTHER reveal modes, so the player can jump straight
  // into chasing a different highscore in the same mode.
  useEffect(() => {
    if (!currentModeId) return;
    let cancelled = false;
    (async () => {
      const [lead, en] = await Promise.all([fetchRevealLeaders(currentModeId), fetchEnabledRevealModes()]);
      if (cancelled) return;
      setOtherLeaders(lead);
      setEnabledModes(en);
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [currentModeId]);

  // After the score posts, the once-fetched reveal-mode leaders are stale (the
  // just-set score is missing). Optimistically promote the player to leader of
  // the mode they just played when it beats the current holder, so the row
  // reflects the fresh score instead of "no scores".
  function handlePosted(info: { id: string; name: string }) {
    setOtherLeaders((prev) => {
      if (!prev) return prev;
      const cur = prev[gameMode];
      if (cur && cur.score >= totalScore) return prev;
      return {
        ...prev,
        [gameMode]: {
          id: info.id,
          name: info.name,
          score: totalScore,
          correct: correctCount,
          gameModes: [gameMode],
          country: null,
          createdAt: Date.now(),
          deviceId: info.id,
        },
      };
    });
  }

  function playReveal(reveal: RevealMode) {
    if (!currentModeId || !currentModeFilter) return;
    const store = useGameStore.getState();
    store.setRevealChoice(reveal);
    void store.selectPool({ kind: 'custom', modeId: currentModeId, filter: currentModeFilter, name: currentModeName ?? '' });
  }

  async function onShare() {
    const url = shareLink({ score: totalScore, correct: correctCount, pool: poolKind });
    const text = `I scored ${totalScore} points in Arcane Drift — beat me: ${url}`;
    try {
      if (navigator.share) {
        // Pass only `text` (which already embeds the URL). Including a separate
        // `url` makes WhatsApp append it again, so the link shows up twice.
        await navigator.share({ title: 'Arcane Drift', text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setShareLabel('Link copied');
      setTimeout(() => setShareLabel('Share score'), 2000);
    } catch {
      // User cancelled the share sheet, or clipboard was blocked — no-op.
    }
  }

  const boardShown = isLeaderboardEnabled() && totalScore > 0;
  const shareButton = (
    <button
      className="ghost-btn"
      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 0' }}
      onClick={onShare}
      data-testid="share-btn"
      aria-label={shareLabel}
      title={shareLabel}
    >
      {shareLabel === 'Link copied' ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="15 17 20 12 15 7" />
          <path d="M4 18v-1a5 5 0 0 1 5-5h11" />
        </svg>
      )}
    </button>
  );

  return (
    <motion.div
      key="gameover"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      data-testid="gameover"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'all',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 18,
        padding: '24px 22px calc(24px + env(safe-area-inset-bottom))',
        overflowY: 'auto',
      }}
    >
      {currentModeName && (
        <div
          data-testid="gameover-mode"
          style={{ textAlign: 'center', color: 'var(--ink-1)', fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, fontSize: 22 }}
        >
          {currentModeName} · {REVEAL_MODE_LABELS[gameMode]}
        </div>
      )}

      <GameOverLeaderboard
        score={totalScore}
        correct={correctCount}
        cards={roundIndex + 1}
        modeId={currentModeId}
        modeFilter={currentModeFilter ?? undefined}
        gameMode={gameMode}
        shareButton={shareButton}
        onPosted={handlePosted}
      />

      {currentModeId && otherLeaders && enabledModes.length > 0 && (
        <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ color: 'var(--ink-2)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>
            Reveal modes
          </span>
          {(enabledModes.includes(gameMode)
            ? [gameMode, ...enabledModes.filter((r) => r !== gameMode)]
            : enabledModes
          ).map((reveal) => {
            const leader = otherLeaders[reveal];
            const isCurrent = reveal === gameMode;
            return (
              <button
                key={reveal}
                type="button"
                data-testid={isCurrent ? 'played-reveal' : 'other-reveal'}
                onClick={() => playReveal(reveal)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
                  padding: '10px 12px', borderRadius: 10,
                  border: isCurrent ? '1px solid var(--ember)' : '1px solid var(--line-strong)',
                  background: isCurrent ? 'rgba(255,138,76,0.10)' : 'rgba(20,17,28,0.55)', cursor: 'pointer',
                }}
              >
                <span style={{ width: 84, color: 'var(--ink-0)', fontFamily: "'Cormorant Garamond', serif", fontSize: 16, fontWeight: 700 }}>
                  {REVEAL_MODE_LABELS[reveal]}
                </span>
                <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--ink-2)', minWidth: 0 }}>
                  {leader ? (
                    <>
                      <span aria-hidden>{countryToFlag(leader.country)}</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{leader.name}</span>
                      <ScoreValue score={leader.score} fontSize={13} />
                    </>
                  ) : (
                    <span style={{ flex: 1 }}>open · no scores</span>
                  )}
                </span>
                {isCurrent && (
                  <span style={{ color: 'var(--ember-hot)', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                    just played
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {!boardShown && (
        <div style={{ width: '100%', maxWidth: 420 }}>{shareButton}</div>
      )}
    </motion.div>
  );
}
