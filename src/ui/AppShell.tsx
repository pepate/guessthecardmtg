import { useEffect, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CardStage } from '../scene/CardStage';
import { useRandomCardArt } from '../cards/useRandomCardArt';
import { useGameStore, type GamePhase } from '../state/gameStore';
import { useAuth } from '../auth/useAuth';
import { getUserId } from '../leaderboard/identity';
import { getProfile } from '../profile/client';
import { subscribeProfile, getProfileVersion } from '../profile/refresh';
import { SUMMONING_TEXTS } from './summoningTexts';
import { CardArtInfo } from './CardArtInfo';
import { BackButton } from './BackButton';
import { InstallButton } from './InstallButton';
import { StartModes } from './StartModes';
import { RevealPicker } from './RevealPicker';
import { CustomModeBuilder } from './CustomModeBuilder';
import { ProfilePanel } from './ProfilePanel';
import { ModeDetail } from './ModeDetail';
import { HUD } from './HUD';
import { Timer } from './Timer';
import { NameChoice } from './NameChoice';
import { GalleryStage } from './GalleryStage';
import { Snackbar } from './Snackbar';
import { GameResultModal } from './GameResultModal';
import { SaveScoreSheet } from './SaveScoreSheet';
import type { CustomMode } from '../modes/types';
import type { CustomFilter } from '../modes/filter';
import type { RevealMode } from '../engine/revealMode';

// Shown behind the start/game-over screens until the random card art loads, so
// the background isn't black during the first Supabase round-trip.
export const FALLBACK_ART = `${import.meta.env.BASE_URL}og-image.jpeg`;

/** The start-screen sub-view (idle phase only). */
export type StartView =
  | { s: 'list' }
  | { s: 'picker'; mode: CustomMode }
  | { s: 'create' }
  | { s: 'profile'; promptName?: boolean };

/** The shared per-round reveal props CardStage needs (everything but `wide` and
 *  `mode` — `mode` is passed separately so callers can narrow out 'gallery'). */
export type CardStageReveal = Omit<ComponentProps<typeof CardStage>, 'wide' | 'mode'>;

// ── Background artwork ────────────────────────────────────────────────────────

/** A random card's artwork, shown faded behind the start screen for a splash of
 *  colour. Best-effort: if the fetch fails we simply render the fallback. */
export function StartArtwork({ showInfo = false, artUrl }: { showInfo?: boolean; artUrl?: string | null }) {
  // When the caller supplies the artwork (e.g. the mode-detail screen's top
  // EDHRec card), don't fetch a random one.
  const art = useRandomCardArt(artUrl === undefined);
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

// ── Loading / error screens ───────────────────────────────────────────────────

function LoadingScreen() {
  // Rotate a random flavour/tip line every ~5s while summoning.
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * SUMMONING_TEXTS.length));
  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % SUMMONING_TEXTS.length), 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <motion.div
      key="loading"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, padding: '0 32px' }}
    >
      <div className="spinner" style={{ width: 46, height: 46, borderWidth: 3 }} />
      <div style={{ color: 'var(--ink-2)', letterSpacing: 2, textTransform: 'uppercase', fontSize: 13 }}>
        Summoning cards…
      </div>
      <motion.div
        key={idx}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{ color: 'var(--ink-1)', fontFamily: "'Cormorant Garamond', serif", fontSize: 22, lineHeight: 1.3, fontStyle: 'italic', textAlign: 'center', maxWidth: 460, minHeight: 58 }}
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
      style={{ position: 'absolute', inset: 0, pointerEvents: 'all', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, padding: '0 24px' }}
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

// ── Account chip ──────────────────────────────────────────────────────────────

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
        style={{ flexShrink: 0, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: '1px solid var(--line-strong)', color: 'var(--ink-1)' }}
      >
        {personIcon(17)}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, textAlign: 'left', lineHeight: 1.2 }}>
        <span
          data-testid="account-name"
          style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
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

// ── Top chrome: home/brand bar + account + back + install ─────────────────────

interface AppChromeProps {
  phase: GamePhase;
  viewS: StartView['s'];
  onReset: () => void;
  onOpenProfile: () => void;
  onOpenGameOverProfile: () => void;
  onBack: () => void;
}

export function AppChrome({ phase, viewS, onReset, onOpenProfile, onOpenGameOverProfile, onBack }: AppChromeProps) {
  const playingOrLoading = phase === 'playing' || phase === 'loading';
  const showAccount = (phase === 'idle' && (viewS === 'list' || viewS === 'picker')) || phase === 'gameover';
  const showBack = phase === 'idle' && (viewS === 'create' || viewS === 'profile');
  return (
    <>
      {playingOrLoading ? (
        <button type="button" className="home-btn" aria-label="Back" data-testid="home-btn" onClick={onReset}>
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
              onClick={onReset}
              style={{ pointerEvents: 'auto', flexShrink: 0, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, border: '1px solid var(--line-strong)', background: 'rgba(13,11,19,0.6)', color: 'var(--ink-0)', cursor: 'pointer', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
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

      {showAccount && (
        <AccountButton onOpen={phase === 'gameover' ? onOpenGameOverProfile : onOpenProfile} />
      )}
      {showBack && <BackButton onBack={onBack} />}
      {phase === 'gameover' && <InstallButton />}
    </>
  );
}

// ── Play area: HUD + card + name choices ──────────────────────────────────────

interface PlayAreaProps {
  cardStage: CardStageReveal;
  mode: RevealMode;
  wide: boolean;
  playingNow: boolean;
  elapsedMs: number;
  timeLeftMs: number;
}

export function PlayArea({ cardStage, mode, wide, playingNow, elapsedMs, timeLeftMs }: PlayAreaProps) {
  return (
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
          <CardStage {...cardStage} mode={mode} wide />
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
  );
}

// ── Screen switch: the AnimatePresence overlay ────────────────────────────────

interface ScreenSwitchProps {
  phase: GamePhase;
  view: StartView;
  setView: (v: StartView) => void;
  currentModeId: string | null;
  currentModeName: string | null;
  currentModeFilter: CustomFilter | null;
  pendingRow: ComponentProps<typeof ModeDetail>['pendingRow'];
  dailyReveal: RevealMode | null;
  onReplayDaily: () => void;
  onReset: () => void;
  onBackToMode: () => void;
  playArea: ReactNode;
}

export function ScreenSwitch({
  phase, view, setView, currentModeId, currentModeName, currentModeFilter,
  pendingRow, dailyReveal, onReplayDaily, onReset, onBackToMode, playArea,
}: ScreenSwitchProps) {
  return (
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
            pendingRow={pendingRow}
            lockedReveal={dailyReveal}
            onPlayAgain={dailyReveal ? onReplayDaily : undefined}
            onHome={onReset}
            onBackToMode={onBackToMode}
          />
        )}

        {playArea}
      </AnimatePresence>

      {phase === 'playing' && <Snackbar />}
    </div>
  );
}

// ── Game-over overlays: result modal + save-score sheet ───────────────────────

interface GameOverOverlaysProps {
  phase: GamePhase;
  resultOpen: boolean;
  profileOpen: boolean;
  score: number;
  total: number;
  totalRank: number | null;
  modeName?: string;
  needsSave: boolean;
  hasNextMode: boolean;
  onNextMode: () => void;
  onSaveRank: () => void;
  onReplay: () => void;
  onShare: () => void;
  onCloseResult: () => void;
  onSaved: ComponentProps<typeof SaveScoreSheet>['onSaved'];
  onCloseProfile: () => void;
}

export function GameOverOverlays({
  phase, resultOpen, profileOpen, score, total, totalRank, modeName, needsSave, hasNextMode,
  onNextMode, onSaveRank, onReplay, onShare, onCloseResult, onSaved, onCloseProfile,
}: GameOverOverlaysProps) {
  if (phase !== 'gameover') return null;
  return (
    <>
      {resultOpen && !profileOpen && (
        <GameResultModal
          score={score}
          total={total}
          totalRank={totalRank}
          modeName={modeName}
          needsSave={needsSave}
          hasNextMode={hasNextMode}
          onNextMode={onNextMode}
          onSaveRank={onSaveRank}
          onReplay={onReplay}
          onShare={onShare}
          onClose={onCloseResult}
        />
      )}
      {profileOpen && (
        <SaveScoreSheet
          rank={totalRank}
          modeName={modeName}
          onSaved={onSaved}
          onClose={onCloseProfile}
        />
      )}
    </>
  );
}
