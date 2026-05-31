import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CardStage } from './scene/CardStage';
import { fetchRandomCard } from './cards/client';
import { useGameStore } from './state/gameStore';
import { useGameClock, useGameTimeLeft } from './state/useGameClock';
import { stageAt, scanProgressAt, scanAngleFor, tilesRevealedAt, tileOrderFor, spotlightOriginFor } from './engine/timeAttack';
import { StartModes } from './ui/StartModes';
import { RevealPicker } from './ui/RevealPicker';
import { CustomModeBuilder } from './ui/CustomModeBuilder';
import { ProfilePanel } from './ui/ProfilePanel';
import { WelcomeWizard } from './ui/WelcomeWizard';
import { useAuth } from './auth/useAuth';
import type { CustomMode } from './modes/types';
import { HUD } from './ui/HUD';
import { Timer } from './ui/Timer';
import { NameChoice } from './ui/NameChoice';
import { Snackbar } from './ui/Snackbar';
import { GameOver } from './ui/GameOver';
import { GameOverArtwork } from './ui/GameOverArtwork';
import { BackButton } from './ui/BackButton';
import { InstallButton } from './ui/InstallButton';
import { useWideLayout } from './ui/useWideLayout';
import { SUMMONING_TEXTS } from './ui/summoningTexts';
import { parseDeeplink } from './share/deeplink';
import { getModeById } from './modes/client';

// After a round resolves: a correct guess flashes green briefly, a miss / timeout
// reveals the full card for a beat — then we auto-advance to the next card.
const ADVANCE_DELAY = { won: 1000, lost: 2000 } as const;

// Shown behind the start/game-over screens until the random card art loads, so
// the background isn't black during the first Supabase round-trip.
const FALLBACK_ART = `${import.meta.env.BASE_URL}og-image.jpeg`;

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

  const bg = art ?? FALLBACK_ART;

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
  const gameMode = useGameStore((s) => s.gameMode);
  const loadRevealModes = useGameStore((s) => s.loadRevealModes);
  const revealSeed = useGameStore((s) => s.revealSeed);
  const config = useGameStore((s) => s.config);
  const advance = useGameStore((s) => s.advance);
  const reset = useGameStore((s) => s.reset);

  const elapsedMs = useGameClock();
  const timeLeftMs = useGameTimeLeft();
  const stage = stageAt(elapsedMs, config);
  const playingNow = phase === 'playing' && round?.status === 'playing';
  const mode = gameMode;
  const scanProgress = playingNow ? scanProgressAt(elapsedMs, config) : 1;
  const scanAngle = scanAngleFor(revealSeed, roundIndex);
  const scanManaHidden = playingNow && elapsedMs < config.scanManaRevealMs;
  // Cards often print their own name in the rules text — keep the text box redacted
  // early (same 5s window as mana) in the spatial-reveal modes so it can't leak the answer.
  const scanTextHidden = playingNow && elapsedMs < config.scanManaRevealMs;
  const tileCount = config.mosaicCols * config.mosaicRows;
  const tilesRevealed = playingNow ? tilesRevealedAt(elapsedMs, config) : tileCount;
  const tileOrder = tileOrderFor(revealSeed, roundIndex, tileCount);
  const spotlightOrigin = spotlightOriginFor(revealSeed, roundIndex);
  const wide = useWideLayout();

  type StartView = { s: 'list' } | { s: 'picker'; mode: CustomMode } | { s: 'create' } | { s: 'profile' };
  const [view, setView] = useState<StartView>({ s: 'list' });
  const { recovery } = useAuth();

  // First-ever open (and not arriving via a shared deeplink) → show the wizard once.
  const [showWizard, setShowWizard] = useState(
    () => !localStorage.getItem('guessthecard.welcomed') && !parseDeeplink(window.location.search),
  );
  function dismissWizard() {
    localStorage.setItem('guessthecard.welcomed', '1');
    setShowWizard(false);
  }

  useEffect(() => {
    if (phase !== 'idle') setView({ s: 'list' });
  }, [phase]);

  // Returning from a password-reset link drops the player into recovery mode —
  // open the profile panel so they can set a new password.
  useEffect(() => {
    if (recovery && phase === 'idle') setView({ s: 'profile' });
  }, [recovery, phase]);

  useEffect(() => {
    void loadRevealModes();
  }, [loadRevealModes]);

  // Deeplink (?m=&r=): open straight into the shared mode + reveal and auto-start.
  useEffect(() => {
    const dl = parseDeeplink(window.location.search);
    if (!dl) return;
    let cancelled = false;
    (async () => {
      const mode = await getModeById(dl.modeId);
      if (cancelled || !mode) return;
      const store = useGameStore.getState();
      store.setRevealChoice(dl.reveal);
      void store.selectPool({ kind: 'custom', modeId: mode.id, filter: mode.filter, name: mode.name });
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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
      {showWizard && <WelcomeWizard onClose={dismissWizard} />}
      {phase === 'playing' || phase === 'loading' ? (
        <button
          type="button"
          className="home-btn"
          aria-label="Back"
          data-testid="home-btn"
          onClick={reset}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      ) : (
        <header className="brandbar" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {phase === 'gameover' && (
            <button
              type="button"
              aria-label="Back to menu"
              data-testid="gameover-home"
              onClick={reset}
              style={{
                pointerEvents: 'auto',
                flexShrink: 0,
                width: 40,
                height: 40,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 10,
                border: '1px solid var(--line-strong)',
                background: 'rgba(13,11,19,0.6)',
                color: 'var(--ink-0)',
                cursor: 'pointer',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 10.5 12 3l9 7.5" />
                <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
              </svg>
            </button>
          )}
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="brand-name">Arcane Drift</span>
            <span className="brand-sub">guess the card</span>
          </span>
        </header>
      )}

      {phase === 'idle' && view.s === 'list' && (
        <button
          type="button"
          aria-label="Profile"
          data-testid="account-btn"
          onClick={() => setView({ s: 'profile' })}
          style={{
            position: 'absolute',
            top: 'calc(12px + env(safe-area-inset-top))',
            right: 12,
            zIndex: 5,
            width: 40,
            height: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 10,
            border: '1px solid var(--line-strong)',
            background: 'rgba(13,11,19,0.6)',
            color: 'var(--ink-0)',
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            pointerEvents: 'auto',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </button>
      )}
      {phase === 'idle' && view.s !== 'list' && <BackButton onBack={() => setView({ s: 'list' })} />}
      {phase === 'gameover' && <InstallButton />}
      {phase === 'idle' && <StartArtwork />}
      {phase === 'gameover' && <GameOverArtwork />}
      {round && !(wide && phase === 'playing') && (
        <CardStage stage={playingNow ? stage : 5} mode={mode} progress={scanProgress} angle={scanAngle} manaHidden={scanManaHidden} textHidden={scanTextHidden} spotlightOrigin={spotlightOrigin} tileOrder={tileOrder} tilesRevealed={tilesRevealed} />
      )}

      <div className="overlay">
        <AnimatePresence mode="wait">
          {phase === 'idle' && view.s === 'list' && (
            <StartModes
              key="modes"
              onPick={(mode) => setView({ s: 'picker', mode })}
              onCreate={() => setView({ s: 'create' })}
            />
          )}

          {phase === 'idle' && view.s === 'picker' && (
            <RevealPicker key="picker" mode={view.mode} />
          )}

          {phase === 'idle' && view.s === 'create' && (
            <CustomModeBuilder key="create" onCreated={(mode) => setView({ s: 'picker', mode })} />
          )}

          {phase === 'idle' && view.s === 'profile' && <ProfilePanel key="profile" />}

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
                    <CardStage stage={playingNow ? stage : 5} mode={mode} progress={scanProgress} angle={scanAngle} manaHidden={scanManaHidden} textHidden={scanTextHidden} spotlightOrigin={spotlightOrigin} tileOrder={tileOrder} tilesRevealed={tilesRevealed} wide />
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
