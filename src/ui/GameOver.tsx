import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../state/gameStore';
import { useCountUp } from './useCountUp';
import { GameOverLeaderboard } from './GameOverLeaderboard';
import { shareLink } from '../share/score';
import type { RevealMode } from '../engine/timeAttack';
import { listModes, getModeById } from '../modes/client';
import { fetchAutoAdvanceTarget, fetchRevealLeaders } from '../leaderboard/client';
import { fetchEnabledRevealModes } from '../reveal/client';
import { REVEAL_MODE_LABELS } from '../reveal/labels';
import { getDeviceId } from '../leaderboard/identity';
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
  const highscores = useGameStore((s) => s.highscores);
  const restart = useGameStore((s) => s.restart);
  const reset = useGameStore((s) => s.reset);

  const [shareLabel, setShareLabel] = useState('Share score');
  const [nextTarget, setNextTarget] = useState<{ modeId: string; reveal: RevealMode } | null>(null);
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

  function playReveal(reveal: RevealMode) {
    if (!currentModeId || !currentModeFilter) return;
    const store = useGameStore.getState();
    store.setRevealChoice(reveal);
    void store.selectPool({ kind: 'custom', modeId: currentModeId, filter: currentModeFilter, name: currentModeName ?? '' });
  }

  // Suggest the next combo to chase: one where this device isn't already #1 and
  // someone else has set a score (preferring where the device has fewest points).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const modes = await listModes(200);
      const enabled = await fetchEnabledRevealModes();
      const target = await fetchAutoAdvanceTarget(modes.map((m) => m.id), getDeviceId(), enabled);
      if (!cancelled) setNextTarget(target);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function onNext() {
    if (!nextTarget) return;
    const mode = await getModeById(nextTarget.modeId);
    if (!mode) return;
    const store = useGameStore.getState();
    store.setRevealChoice(nextTarget.reveal);
    void store.selectPool({ kind: 'custom', modeId: mode.id, filter: mode.filter, name: mode.name });
  }

  const animatedScore = useCountUp(totalScore, 1100, 1, 0);
  const best = highscores[0]?.score ?? 0;
  const isBest = totalScore > 0 && totalScore >= best;

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
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            letterSpacing: 3,
            textTransform: 'uppercase',
            color: isBest ? 'var(--ember-hot)' : 'var(--ink-2)',
          }}
        >
          {isBest ? 'New record' : 'Time up'}
        </div>
        <div data-testid="final-correct" style={{ fontSize: 52, fontWeight: 700, color: 'var(--ink-0)', margin: '4px 0' }}>
          {correctCount}
        </div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--ink-2)' }}>
          cards correct
        </div>
        <div style={{ color: 'var(--ember-hot)', fontSize: 24, fontWeight: 600, marginTop: 6 }}>
          <span data-testid="final-score">{animatedScore}</span> points
        </div>
      </div>

      <GameOverLeaderboard
        score={totalScore}
        correct={correctCount}
        modeId={currentModeId}
        modeName={currentModeName ?? undefined}
        modeFilter={currentModeFilter ?? undefined}
        gameMode={gameMode}
      />

      {currentModeId && otherLeaders && enabledModes.filter((r) => r !== gameMode).length > 0 && (
        <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ color: 'var(--ink-2)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>
            Other reveal modes
          </span>
          {enabledModes.filter((r) => r !== gameMode).map((reveal) => {
            const leader = otherLeaders[reveal];
            return (
              <button
                key={reveal}
                type="button"
                data-testid="other-reveal"
                onClick={() => playReveal(reveal)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
                  padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line-strong)',
                  background: 'rgba(20,17,28,0.55)', cursor: 'pointer',
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
              </button>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 420 }}>
        {nextTarget && (
          <button className="ember-btn" style={{ width: '100%' }} onClick={onNext} data-testid="next-challenge-btn">
            Beat a new highscore →
          </button>
        )}
        <button
          className={nextTarget ? 'ghost-btn' : 'ember-btn'}
          style={{ width: '100%' }}
          onClick={restart}
        >
          Play again
        </button>
        <button
          className="ghost-btn"
          style={{ width: '100%' }}
          onClick={onShare}
          data-testid="share-btn"
        >
          {shareLabel}
        </button>
        <button className="ghost-btn" style={{ width: '100%' }} onClick={reset}>
          Back to menu
        </button>
      </div>
    </motion.div>
  );
}
