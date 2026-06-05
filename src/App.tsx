import { useEffect, useState, useSyncExternalStore } from 'react';
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
import { startMostPlayedGame } from './modes/quickStart';
import { useAuth } from './auth/useAuth';
import { getUserId } from './leaderboard/identity';
import { getProfile } from './profile/client';
import { subscribeProfile, getProfileVersion } from './profile/refresh';
import type { CustomMode } from './modes/types';
import { HUD } from './ui/HUD';
import { Timer } from './ui/Timer';
import { NameChoice } from './ui/NameChoice';
import { GalleryStage } from './ui/GalleryStage';
import { Snackbar } from './ui/Snackbar';
import { ModeDetail } from './ui/ModeDetail';
import { GameResultModal } from './ui/GameResultModal';
import { SaveScoreSheet } from './ui/SaveScoreSheet';
import { usePendingRun } from './leaderboard/usePendingRun';
import { fetchModeTopArt } from './cards/client';
import { useScreenBack } from './ui/useScreenBack';
import { shareLink } from './share/score';
import { GameOverArtwork } from './ui/GameOverArtwork';
import { CardArtInfo } from './ui/CardArtInfo';
import { BackButton } from './ui/BackButton';
import { InstallButton } from './ui/InstallButton';
import { useWideLayout } from './ui/useWideLayout';
import { SUMMONING_TEXTS } from './ui/summoningTexts';
import { parseDeeplink, parseModeLink } from './share/deeplink';
import { getModeById } from './modes/client';

// After a round resolves: a correct guess flashes green briefly, a miss / timeout
// reveals the full card for a beat — then we auto-advance to the next card.
const ADVANCE_DELAY = { won: 1000, lost: 2000 } as const;

// Shown behind the start/game-over screens until the random card art loads, so
// the background isn't black during the first Supabase round-trip.
const FALLBACK_ART = `${import.meta.env.BASE_URL}og-image.jpeg`;

// A random card's artwork, shown faded behind the start screen for a splash of
// colour. Best-effort: if the fetch fails we simply render nothing.
function StartArtwork({ showInfo = false, artUrl }: { showInfo?: boolean; artUrl?: string | null }) {
  const [art, setArt] = useState<string | null>(null);

  useEffect(() => {
    // When the caller supplies the artwork (e.g. the mode-detail screen's top
    // EDHRec card), don't fetch a random one.
    if (artUrl !== undefined) return;
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
  }, [artUrl]);

  const bg = (artUrl ?? art) ?? FALLBACK_ART;

  return (
    <>
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
      {/* Centred at the top so it clears the account chip on the right entirely. */}
      {showInfo && <CardArtInfo art={bg} center />}
    </>
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

// Top-right account chip, identical on every screen it appears on: the player's
// claimed name, or a "Guest / Tap to set up" prompt. Tapping opens the profile
// (or, at game over, the save-your-score sheet).
function AccountButton({ onOpen }: { onOpen: () => void }) {
  const { status } = useAuth();
  // Refetch when auth status flips AND whenever a name is claimed/changed
  // (claiming keeps status === 'anonymous', so status alone never re-fires).
  const profileVersion = useSyncExternalStore(subscribeProfile, getProfileVersion, () => 0);
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const uid = await getUserId().catch(() => null);
      const profile = uid ? await getProfile(uid).catch(() => null) : null;
      if (!cancelled) setName(profile?.displayName ?? null);
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [status, profileVersion]);

  const personIcon = (size: number) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );

  return (
    <button
      type="button"
      aria-label={name ? `Profile: ${name}` : 'Set up your profile'}
      data-testid="account-btn"
      onClick={onOpen}
      style={{
        position: 'absolute',
        top: 'calc(12px + env(safe-area-inset-top))',
        right: 12,
        zIndex: 6,
        border: '1px solid var(--line-strong)',
        background: 'rgba(13,11,19,0.6)',
        color: 'var(--ink-0)',
        cursor: 'pointer',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        pointerEvents: 'auto',
        maxWidth: 'min(62vw, 230px)',
        height: 46,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 16px 0 10px',
        borderRadius: 999,
      }}
    >
      <span
        aria-hidden
        style={{
          flexShrink: 0,
          width: 28,
          height: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
          border: '1px solid var(--line-strong)',
          color: 'var(--ink-1)',
        }}
      >
        {personIcon(17)}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, textAlign: 'left', lineHeight: 1.2 }}>
        <span
          data-testid="account-name"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 14,
            fontWeight: 700,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name ?? 'Guest'}
        </span>
        {!name && (
          <span style={{ fontSize: 12, color: 'var(--ink-1)', whiteSpace: 'nowrap' }}>
            Tap to set up
          </span>
        )}
      </span>
    </button>
  );
}

export function App() {
  const phase = useGameStore((s) => s.phase);
  const round = useGameStore((s) => s.round);
  const roundIndex = useGameStore((s) => s.roundIndex);
  const gameMode = useGameStore((s) => s.gameMode);
  const totalScore = useGameStore((s) => s.totalScore);
  const correctCount = useGameStore((s) => s.correctCount);
  const currentModeId = useGameStore((s) => s.currentModeId);
  const currentModeName = useGameStore((s) => s.currentModeName);
  const currentModeFilter = useGameStore((s) => s.currentModeFilter);
  const poolKind = useGameStore((s) => s.poolKind);
  const dailyReveal = useGameStore((s) => s.dailyReveal);
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

  type StartView = { s: 'list' } | { s: 'picker'; mode: CustomMode } | { s: 'create' } | { s: 'profile'; promptName?: boolean };
  const [view, setView] = useState<StartView>({ s: 'list' });
  const { recovery, authError } = useAuth();

  // Game-over: the just-finished run is held here (posted only once a name exists).
  const [gameOverProfileOpen, setGameOverProfileOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const pendingRunInput =
    phase === 'gameover' && totalScore > 0
      ? { score: totalScore, correct: correctCount, cards: roundIndex + 1, gameMode }
      : null;
  const pending = usePendingRun(pendingRunInput, currentModeId, currentModeFilter);
  const gameOverPendingRow =
    pendingRunInput && pending.projectedRank != null
      ? {
          rank: pending.postedRank ?? pending.projectedRank,
          name: pending.needsLogin ? null : pending.name,
          score: pendingRunInput.score,
          total: pending.projectedTotal ?? pendingRunInput.score,
          correct: pendingRunInput.correct,
          gameMode: pendingRunInput.gameMode,
          onLogin: () => setGameOverProfileOpen(true),
        }
      : null;

  function replayDaily() {
    if (!dailyReveal || !currentModeId) return;
    const s = useGameStore.getState();
    s.setRevealChoice(dailyReveal);
    void s.selectPool({ kind: 'custom', modeId: currentModeId, filter: currentModeFilter ?? {}, name: currentModeName ?? 'Daily Set', daily: dailyReveal });
  }

  function replayGame() {
    if (!currentModeId) return;
    setResultOpen(false);
    const s = useGameStore.getState();
    s.setRevealChoice(gameMode);
    void s.selectPool({ kind: 'custom', modeId: currentModeId, filter: currentModeFilter ?? {}, name: currentModeName ?? '', daily: dailyReveal ?? undefined });
  }

  function nextMode() {
    if (!currentModeId || !pending.nextMode) return;
    setResultOpen(false);
    const s = useGameStore.getState();
    s.setRevealChoice(pending.nextMode);
    void s.selectPool({ kind: 'custom', modeId: currentModeId, filter: currentModeFilter ?? {}, name: currentModeName ?? '' });
  }

  // Game-over → this mode's picker page. Resolve the full mode (for card_count)
  // before leaving game-over, since reset() clears the current-mode fields.
  async function backToMode() {
    const id = currentModeId;
    if (!id) { reset(); return; }
    const mode = await getModeById(id).catch(() => null);
    reset();
    if (mode) setView({ s: 'picker', mode });
  }

  async function shareStats() {
    const url = shareLink({ score: totalScore, correct: correctCount, pool: poolKind });
    const text = `I scored ${totalScore} points in GuessTheCard — beat me: ${url}`;
    try {
      if (navigator.share) { await navigator.share({ title: 'GuessTheCard', text }); return; }
      await navigator.clipboard.writeText(text);
    } catch {
      /* dismissed or blocked — no-op */
    }
  }

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

  useEffect(() => {
    if (phase !== 'gameover') setGameOverProfileOpen(false);
  }, [phase]);

  // Show the result popup over the played mode each time a game ends.
  useEffect(() => {
    setResultOpen(phase === 'gameover');
  }, [phase]);

  // Mode-detail background: the pool's most-popular (lowest-EDHRec) card art.
  const [pickerArt, setPickerArt] = useState<string | null>(null);
  const pickerFilter = phase === 'idle' && view.s === 'picker' ? view.mode.filter : null;
  useEffect(() => {
    if (!pickerFilter) { setPickerArt(null); return; }
    let cancelled = false;
    setPickerArt(null);
    fetchModeTopArt(pickerFilter).then((a) => { if (!cancelled) setPickerArt(a); }).catch(() => {});
    return () => { cancelled = true; };
  }, [pickerFilter]);

  // Device/browser Back → previous screen (except the root list). In a game or
  // game-over, Back leaves to the menu (same as the on-screen home button).
  const atRoot = phase === 'idle' && view.s === 'list';
  useScreenBack(!atRoot, () => {
    if (phase === 'idle' && view.s !== 'list') setView({ s: 'list' });
    else reset();
  });

  // Returning from a password-reset link drops the player into recovery mode —
  // open the profile panel so they can set a new password.
  useEffect(() => {
    if (recovery && phase === 'idle') setView({ s: 'profile' });
  }, [recovery, phase]);

  // A failed Google link/sign-in redirects back here with an error — open the
  // profile so the message (and the sign-in option) are visible.
  useEffect(() => {
    if (authError && phase === 'idle') setView({ s: 'profile' });
  }, [authError, phase]);

  useEffect(() => {
    void loadRevealModes();
  }, [loadRevealModes]);

  // Deeplink (?m=&r=): open straight into the shared mode + reveal and auto-start.
  // A mode-only link (?m= without a reveal, e.g. from a "Your standing" share)
  // instead opens that mode's picker page without starting a game.
  useEffect(() => {
    const dl = parseDeeplink(window.location.search);
    const modeOnlyId = dl ? null : parseModeLink(window.location.search);
    if (!dl && !modeOnlyId) return;
    let cancelled = false;
    (async () => {
      const mode = await getModeById(dl ? dl.modeId : modeOnlyId!);
      if (cancelled || !mode) return;
      if (dl) {
        const store = useGameStore.getState();
        store.setRevealChoice(dl.reveal);
        void store.selectPool({ kind: 'custom', modeId: mode.id, filter: mode.filter, name: mode.name });
      } else {
        setView({ s: 'picker', mode });
      }
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
      {showWizard && (
        <WelcomeWizard
          onClose={dismissWizard}
          onStart={() => { dismissWizard(); void startMostPlayedGame(); }}
        />
      )}
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
            <span className="brand-name">GuessTheCard</span>
          </span>
        </header>
      )}

      {/* Account control stays top-right across screens (except the profile
          itself): a full chip on the start list, an icon elsewhere so the player
          can always reach / recognise their profile. */}
      {/* Same account chip on every primary screen (start list, mode detail,
          game over). The picker carries its own bottom Back button; create /
          profile are focused sub-screens with a top-right Back instead. */}
      {((phase === 'idle' && (view.s === 'list' || view.s === 'picker')) || phase === 'gameover') && (
        <AccountButton
          onOpen={() => { if (phase === 'gameover') setGameOverProfileOpen(true); else setView({ s: 'profile' }); }}
        />
      )}
      {phase === 'idle' && (view.s === 'create' || view.s === 'profile') && (
        <BackButton onBack={() => setView({ s: 'list' })} />
      )}
      {phase === 'gameover' && <InstallButton />}
      {/* Start screens use our standard wallpaper (og-image); only the mode-detail
          picker shows the pool's own top-card art. */}
      {phase === 'idle' && <StartArtwork artUrl={view.s === 'picker' ? pickerArt : FALLBACK_ART} />}
      {phase === 'gameover' && <GameOverArtwork />}
      {round && mode !== 'gallery' && !(wide && phase === 'playing') && (
        <CardStage stage={playingNow ? stage : 5} mode={mode} progress={scanProgress} angle={scanAngle} manaHidden={scanManaHidden} textHidden={scanTextHidden} spotlightOrigin={spotlightOrigin} tileOrder={tileOrder} tilesRevealed={tilesRevealed} />
      )}

      <div className="overlay">
        <AnimatePresence mode="wait">
          {phase === 'idle' && view.s === 'list' && (
            <StartModes
              key="modes"
              onPick={(mode) => setView({ s: 'picker', mode })}
              onCreate={() => setView({ s: 'create' })}
              onNeedAccount={() => setView({ s: 'profile', promptName: true })}
            />
          )}

          {phase === 'idle' && view.s === 'picker' && (
            <RevealPicker key="picker" mode={view.mode} onBack={() => setView({ s: 'list' })} />
          )}

          {phase === 'idle' && view.s === 'create' && (
            <CustomModeBuilder key="create" onCreated={(mode) => setView({ s: 'picker', mode })} />
          )}

          {phase === 'idle' && view.s === 'profile' && (
            <ProfilePanel key="profile" promptName={view.promptName} ensureSession={view.promptName} onBack={() => setView({ s: 'list' })} />
          )}

          {phase === 'loading' && <LoadingScreen />}
          {phase === 'error' && <ErrorScreen />}
          {phase === 'gameover' && (
            <ModeDetail
              key="gameover"
              modeId={currentModeId}
              modeName={currentModeName ?? ''}
              filter={currentModeFilter ?? {}}
              pendingRow={gameOverPendingRow}
              lockedReveal={dailyReveal}
              onPlayAgain={dailyReveal ? replayDaily : undefined}
              onHome={reset}
              onBackToMode={() => void backToMode()}
            />
          )}

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
              {mode === 'gallery' ? (
                <GalleryStage />
              ) : wide ? (
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

      {phase === 'gameover' && resultOpen && !gameOverProfileOpen && (
        <GameResultModal
          score={totalScore}
          total={pending.projectedTotal ?? totalScore}
          totalRank={pending.postedRank ?? pending.projectedRank}
          modeName={currentModeName ?? undefined}
          needsSave={pending.needsLogin}
          hasNextMode={!dailyReveal && pending.nextMode != null}
          onNextMode={nextMode}
          onSaveRank={() => { setResultOpen(false); setGameOverProfileOpen(true); }}
          onReplay={replayGame}
          onShare={() => void shareStats()}
          onClose={() => setResultOpen(false)}
        />
      )}

      {phase === 'gameover' && gameOverProfileOpen && (
        <SaveScoreSheet
          rank={pending.postedRank ?? pending.projectedRank}
          modeName={currentModeName ?? undefined}
          onSaved={(name) => pending.postNow(name)}
          onClose={() => setGameOverProfileOpen(false)}
        />
      )}
    </div>
  );
}
