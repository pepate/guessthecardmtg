import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CardStage } from './scene/CardStage';
import { fetchRandomCard } from './scryfall/client';
import { useGameStore } from './state/gameStore';
import { useGameClock, useGameTimeLeft } from './state/useGameClock';
import { stageAt } from './engine/timeAttack';
import { PoolSelect } from './ui/PoolSelect';
import { HUD } from './ui/HUD';
import { Timer } from './ui/Timer';
import { NameChoice } from './ui/NameChoice';
import { Snackbar } from './ui/Snackbar';
import { GameOver } from './ui/GameOver';
import { StartShare } from './ui/StartShare';

// After a round resolves: a correct guess flashes green briefly, a miss / timeout
// reveals the full card for a beat — then we auto-advance to the next card.
const ADVANCE_DELAY = { won: 1000, lost: 2000 } as const;

// A random card's artwork, shown faded behind the start screen for a splash of
// colour. Best-effort: if the fetch fails we simply render nothing.
function StartArtwork() {
  const [art, setArt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRandomCard()
      .then((card) => {
        const url = card.image_uris?.art_crop ?? card.card_faces?.[0]?.image_uris?.art_crop ?? null;
        if (!cancelled) setArt(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!art) return null;
  return (
    <motion.div
      key="start-art"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.2 }}
      aria-hidden
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '58%',
        backgroundImage: `url(${art})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        maskImage: 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.35) 55%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.35) 55%, transparent 100%)',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
}

function LoadingScreen() {
  return (
    <motion.div
      key="loading"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
      }}
    >
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: '50%',
          border: '3px solid rgba(255,186,120,0.18)',
          borderTopColor: 'var(--ember)',
          animation: 'spin 0.9s linear infinite',
        }}
      />
      <div style={{ color: 'var(--ink-2)', letterSpacing: 2, textTransform: 'uppercase', fontSize: 13 }}>
        Summoning cards…
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </motion.div>
  );
}

function ErrorScreen() {
  const error = useGameStore((s) => s.error);
  const reset = useGameStore((s) => s.reset);
  return (
    <motion.div
      key="error"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'all',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        padding: '0 24px',
      }}
    >
      <p style={{ color: 'var(--ember-hot)', fontSize: 19, textAlign: 'center', margin: 0 }}>
        {error ?? 'Unknown error'}
      </p>
      <button className="ember-btn" onClick={reset}>
        Back to menu
      </button>
    </motion.div>
  );
}

export function App() {
  const phase = useGameStore((s) => s.phase);
  const round = useGameStore((s) => s.round);
  const config = useGameStore((s) => s.config);
  const advance = useGameStore((s) => s.advance);

  const elapsedMs = useGameClock();
  const timeLeftMs = useGameTimeLeft();
  const stage = stageAt(elapsedMs, config);
  const playingNow = phase === 'playing' && round?.status === 'playing';

  const status = round?.status;
  const startedAt = round?.startedAt;
  useEffect(() => {
    if (phase !== 'playing' || !status || status === 'playing') return;
    const delay = status === 'won' ? ADVANCE_DELAY.won : ADVANCE_DELAY.lost;
    const id = setTimeout(advance, delay);
    return () => clearTimeout(id);
  }, [phase, status, startedAt, advance]);

  return (
    <div className="stage-root">
      <header className="brandbar">
        <span className="brand-name">Arcane Drift</span>
        <span className="brand-sub">guess the card</span>
      </header>

      {phase === 'idle' && <StartShare />}
      {phase === 'idle' && <StartArtwork />}
      {round && <CardStage stage={playingNow ? stage : 5} />}

      <div className="overlay">
        <AnimatePresence mode="wait">
          {phase === 'idle' && (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bottom-sheet"
            >
              <PoolSelect />
            </motion.div>
          )}

          {phase === 'loading' && <LoadingScreen />}
          {phase === 'error' && <ErrorScreen />}
          {phase === 'gameover' && <GameOver />}

          {phase === 'playing' && round && (
            <motion.div
              key="playing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ display: 'flex', flexDirection: 'column', height: '100%', pointerEvents: 'none' }}
            >
              <div style={{ pointerEvents: 'all' }}>
                <HUD timeLeftMs={timeLeftMs} />
              </div>
              <div style={{ flex: 1 }} />
              <div className="bottom-sheet" style={{ pointerEvents: 'all', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {playingNow && <Timer elapsedMs={elapsedMs} />}
                <NameChoice />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {phase === 'playing' && <Snackbar />}
      </div>
    </div>
  );
}
