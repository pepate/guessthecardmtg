import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CardStage } from './scene/CardStage';
import { fetchRandomCard } from './cards/client';
import { useGameStore } from './state/gameStore';
import { useGameClock, useGameTimeLeft } from './state/useGameClock';
import { stageAt, scanProgressAt, revealModeFor, scanAngleFor, tilesRevealedAt, tileOrderFor, zoomFocusFor, spotlightOriginFor } from './engine/timeAttack';
import { PoolSelect } from './ui/PoolSelect';
import { CustomModeBrowser } from './ui/CustomModeBrowser';
import { HUD } from './ui/HUD';
import { Timer } from './ui/Timer';
import { NameChoice } from './ui/NameChoice';
import { Snackbar } from './ui/Snackbar';
import { GameOver } from './ui/GameOver';
import { StartShare } from './ui/StartShare';
import { InstallButton } from './ui/InstallButton';
import { StartLeaderboard } from './ui/StartLeaderboard';
import { useWideLayout } from './ui/useWideLayout';
import { usePullToRefresh } from './ui/usePullToRefresh';
import { SUMMONING_TEXTS } from './ui/summoningTexts';

// After a round resolves: a correct guess flashes green briefly, a miss / timeout
// reveals the full card for a beat — then we auto-advance to the next card.
const ADVANCE_DELAY = { won: 1000, lost: 2000 } as const;

// Shown behind the start/game-over screens until the random card art loads, so
// the background isn't black during the first Supabase round-trip.
const FALLBACK_ART = `${import.meta.env.BASE_URL}og-image.jpeg`;

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

  const bg = art ?? FALLBACK_ART;

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
            backgroundImage: `url(${bg})`,
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
        backgroundImage: `url(${bg})`,
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
  // Rotate a random flavour/tip line every ~1.9s while summoning, to keep the
  // player engaged during the (deliberately brief) load.
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * SUMMONING_TEXTS.length));
  useEffect(() => {
    const id = setInterval(
      () => setIdx((i) => (i + 1) % SUMMONING_TEXTS.length),
      5000,
    );
    return () => clearInterval(id);
  }, []);

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
        padding: '0 32px',
      }}
    >
      <div className="spinner" style={{ width: 46, height: 46, borderWidth: 3 }} />
      <div style={{ color: 'var(--ink-2)', letterSpacing: 2, textTransform: 'uppercase', fontSize: 13 }}>
        Summoning cards…
      </div>
      <motion.div
        key={idx}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{
          color: 'var(--ink-1)',
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 22,
          lineHeight: 1.3,
          fontStyle: 'italic',
          textAlign: 'center',
          maxWidth: 460,
          minHeight: 58,
        }}
      >
        {SUMMONING_TEXTS[idx]}
      </motion.div>
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
  const roundIndex = useGameStore((s) => s.roundIndex);
  const revealOffset = useGameStore((s) => s.revealOffset);
  const revealSeed = useGameStore((s) => s.revealSeed);
  const enabledModes = useGameStore((s) => s.enabledModes);
  const config = useGameStore((s) => s.config);
  const advance = useGameStore((s) => s.advance);
  const reset = useGameStore((s) => s.reset);

  const elapsedMs = useGameClock();
  const timeLeftMs = useGameTimeLeft();
  const stage = stageAt(elapsedMs, config);
  const playingNow = phase === 'playing' && round?.status === 'playing';
  const mode = revealModeFor(roundIndex, revealOffset, enabledModes);
  const scanProgress = playingNow ? scanProgressAt(elapsedMs, config) : 1;
  const scanAngle = scanAngleFor(revealSeed, roundIndex);
  const scanManaHidden = playingNow && elapsedMs < config.scanManaRevealMs;
  // Cards often print their own name in the rules text — keep the text box redacted
  // early (same 5s window as mana) in the spatial-reveal modes so it can't leak the answer.
  const scanTextHidden = playingNow && elapsedMs < config.scanManaRevealMs;
  const tileCount = config.mosaicCols * config.mosaicRows;
  const tilesRevealed = playingNow ? tilesRevealedAt(elapsedMs, config) : tileCount;
  const tileOrder = tileOrderFor(revealSeed, roundIndex, tileCount);
  const zoomFocus = zoomFocusFor(revealSeed, roundIndex);
  const spotlightOrigin = spotlightOriginFor(revealSeed, roundIndex);
  const zoomTextHidden = playingNow && elapsedMs < config.zoomTextRevealMs;
  const wide = useWideLayout();

  const [screen, setScreen] = useState<'home' | 'custom'>('home');
  const [lbRefreshKey, setLbRefreshKey] = useState(0);
  const { ref: pullRef, pull } = usePullToRefresh<HTMLDivElement>(() =>
    setLbRefreshKey((k) => k + 1),
  );

  useEffect(() => {
    if (phase !== 'idle') setScreen('home');
  }, [phase]);

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
      {round && !(wide && phase === 'playing') && (
        <CardStage stage={playingNow ? stage : 5} mode={mode} progress={scanProgress} angle={scanAngle} manaHidden={scanManaHidden} textHidden={scanTextHidden} zoomTextHidden={zoomTextHidden} zoomFocus={zoomFocus} spotlightOrigin={spotlightOrigin} tileOrder={tileOrder} tilesRevealed={tilesRevealed} />
      )}

      <div className="overlay">
        <AnimatePresence mode="wait">
          {phase === 'idle' && screen === 'custom' && (
            <motion.div
              key="custom"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <CustomModeBrowser onBack={() => setScreen('home')} />
            </motion.div>
          )}

          {phase === 'idle' && screen === 'home' && (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bottom-sheet"
              style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '92%' }}
            >
              <div
                ref={pullRef}
                style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}
              >
                <div
                  aria-hidden
                  style={{ height: pull, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}
                >
                  {pull > 0 && <span className="spinner" />}
                </div>
                <StartLeaderboard refreshKey={lbRefreshKey} />
              </div>
              <div style={{ flexShrink: 0 }}>
                <PoolSelect onOpenCustom={() => setScreen('custom')} />
              </div>
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
              {wide ? (
                <div className="play-wide">
                  {round && (
                    <CardStage stage={playingNow ? stage : 5} mode={mode} progress={scanProgress} angle={scanAngle} manaHidden={scanManaHidden} textHidden={scanTextHidden} zoomTextHidden={zoomTextHidden} zoomFocus={zoomFocus} spotlightOrigin={spotlightOrigin} tileOrder={tileOrder} tilesRevealed={tilesRevealed} wide />
                  )}
                  <div className="options-col">
                    {playingNow && <Timer elapsedMs={elapsedMs} />}
                    <NameChoice layout="column" />
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ flex: 1 }} />
                  <div className="bottom-sheet" style={{ pointerEvents: 'all', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {playingNow && <Timer elapsedMs={elapsedMs} />}
                    <NameChoice />
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {phase === 'playing' && <Snackbar />}
      </div>
    </div>
  );
}
