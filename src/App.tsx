import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CardStage } from './scene/CardStage';
import { fetchRandomCard } from './cards/client';
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
import { InstallButton } from './ui/InstallButton';
import { StartLeaderboard } from './ui/StartLeaderboard';
import { useWideLayout } from './ui/useWideLayout';

// After a round resolves: a correct guess flashes green briefly, a miss / timeout
// reveals the full card for a beat — then we auto-advance to the next card.
const ADVANCE_DELAY = { won: 1000, lost: 2000 } as const;

// A random card's artwork, shown faded behind the start screen for a splash of
// colour. Best-effort: if the fetch fails we simply render nothing.
function StartArtwork({ variant = 'banner' }: { variant?: 'banner' | 'full' }) {
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

  if (variant === 'full') {
    return (
      <motion.div
        key="full-art"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 1.2 }}
        aria-hidden
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${art})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        {/* Scrim that darkens toward the bottom: artwork stays visible up top while
            the lower buttons (esp. Share) sit over near-solid ink for readability. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(180deg, rgba(7,6,10,0.34) 0%, rgba(7,6,10,0.46) 32%, rgba(7,6,10,0.80) 72%, rgba(7,6,10,0.95) 100%)',
          }}
        />
      </motion.div>
    );
  }

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
  const reset = useGameStore((s) => s.reset);

  const elapsedMs = useGameClock();
  const timeLeftMs = useGameTimeLeft();
  const stage = stageAt(elapsedMs, config);
  const playingNow = phase === 'playing' && round?.status === 'playing';
  const wide = useWideLayout();

  const status = round?.status;
  const startedAt = round?.startedAt;
  useEffect(() => {
    if (phase !== 'playing' || !status || status === 'playing') return;
    const delay = status === 'won' ? ADVANCE_DELAY.won : ADVANCE_DELAY.lost;
    const id = setTimeout(advance, delay);
    return () => clearTimeout(id);
  }, [phase, status, startedAt, advance]);

  return (
    <div className="stage-root" data-wide={wide}>
      {phase === 'playing' ? (
        <button
          type="button"
          className="home-btn"
          aria-label="Quit to menu"
          data-testid="home-btn"
          onClick={reset}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
          </svg>
        </button>
      ) : (
        <header className="brandbar">
          <span className="brand-name">Arcane Drift</span>
          <span className="brand-sub">guess the card</span>
        </header>
      )}

      {phase === 'idle' && <StartShare />}
      {phase === 'gameover' && <InstallButton />}
      {phase === 'idle' && <StartArtwork />}
      {phase === 'gameover' && <StartArtwork variant="full" />}
      {round && <CardStage stage={playingNow ? stage : 5} wide={wide} />}

      <div className="overlay">
        <AnimatePresence mode="wait">
          {phase === 'idle' && (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bottom-sheet"
              style={{ display: 'flex', flexDirection: 'column', gap: 18, maxHeight: '92%', overflowY: 'auto' }}
            >
              <StartLeaderboard />
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
              {wide ? (
                <div className="side-panel">
                  {playingNow && <Timer elapsedMs={elapsedMs} />}
                  <NameChoice layout="column" />
                </div>
              ) : (
                <div className="bottom-sheet" style={{ pointerEvents: 'all', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {playingNow && <Timer elapsedMs={elapsedMs} />}
                  <NameChoice />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {phase === 'playing' && <Snackbar />}
      </div>
    </div>
  );
}
