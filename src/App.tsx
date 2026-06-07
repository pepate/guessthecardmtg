import { useEffect, useState } from 'react';
import { CardStage } from './scene/CardStage';
import { useGameStore } from './state/gameStore';
import { useRevealRender } from './state/useRevealRender';
import { WelcomeWizard } from './ui/WelcomeWizard';
import { startMostPlayedGame } from './modes/quickStart';
import { useAuth } from './auth/useAuth';
import { useGameOverRun } from './leaderboard/useGameOverRun';
import { fetchModeTopArt } from './cards/client';
import { useScreenBack } from './ui/useScreenBack';
import { shareLink } from './share/score';
import { GameOverArtwork } from './ui/GameOverArtwork';
import { useWideLayout } from './ui/useWideLayout';
import { parseDeeplink, parseModeLink } from './share/deeplink';
import { isUpdateReady, onUpdateReady, applyUpdate } from './pwa/updates';
import { getModeById } from './modes/client';
import {
  AppChrome,
  ScreenSwitch,
  PlayArea,
  GameOverOverlays,
  StartArtwork,
  FALLBACK_ART,
  type StartView,
} from './ui/AppShell';

// After a round resolves: a correct guess flashes green briefly, a miss / timeout
// reveals the full card for a beat — then we auto-advance to the next card.
const ADVANCE_DELAY = { won: 1000, lost: 2000 } as const;

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
  const advance = useGameStore((s) => s.advance);
  const reset = useGameStore((s) => s.reset);

  // All per-round reveal derivations (stage, scan, mosaic, spotlight, clocks).
  const { elapsedMs, timeLeftMs, playingNow, mode, cardStage: cardStageProps } = useRevealRender();
  const wide = useWideLayout();

  const [view, setView] = useState<StartView>({ s: 'list' });
  const { recovery, authError } = useAuth();

  // Game-over: the just-finished run is held here (posted only once a name exists).
  const [gameOverProfileOpen, setGameOverProfileOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const { pending, pendingRow: gameOverPendingRow, total, totalRank, needsSave, hasNextMode } = useGameOverRun({
    phase,
    totalScore,
    correctCount,
    roundIndex,
    gameMode,
    modeId: currentModeId,
    filter: currentModeFilter,
    dailyReveal,
    onLogin: () => setGameOverProfileOpen(true),
  });

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

  // A new app version reloads silently, but never mid-game: apply it only while
  // the player is idle or on the game-over screen. If it arrives mid-game, the
  // listener defers and this effect re-runs (and applies) once phase goes idle.
  useEffect(() => {
    const apply = () => {
      if (isUpdateReady() && (phase === 'idle' || phase === 'gameover')) applyUpdate();
    };
    apply();
    return onUpdateReady(apply);
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

  const playArea =
    phase === 'playing' && round ? (
      <PlayArea key="playing" cardStage={cardStageProps} mode={mode} wide={wide} playingNow={playingNow} elapsedMs={elapsedMs} timeLeftMs={timeLeftMs} />
    ) : null;

  return (
    <div className="stage-root" data-wide={wide}>
      {showWizard && (
        <WelcomeWizard
          onClose={dismissWizard}
          onStart={() => { dismissWizard(); void startMostPlayedGame(); }}
        />
      )}

      <AppChrome
        phase={phase}
        viewS={view.s}
        onReset={reset}
        onOpenProfile={() => setView({ s: 'profile' })}
        onOpenGameOverProfile={() => setGameOverProfileOpen(true)}
        onBack={() => setView({ s: 'list' })}
      />

      {/* Start screens use our standard wallpaper (og-image); only the mode-detail
          picker shows the pool's own top-card art. */}
      {phase === 'idle' && <StartArtwork artUrl={view.s === 'picker' ? pickerArt : FALLBACK_ART} />}
      {phase === 'gameover' && <GameOverArtwork />}
      {round && mode !== 'gallery' && !(wide && phase === 'playing') && (
        <CardStage {...cardStageProps} mode={mode} />
      )}

      <ScreenSwitch
        phase={phase}
        view={view}
        setView={setView}
        currentModeId={currentModeId}
        currentModeName={currentModeName}
        currentModeFilter={currentModeFilter}
        pendingRow={gameOverPendingRow}
        dailyReveal={dailyReveal}
        onReplayDaily={replayDaily}
        onReset={reset}
        onBackToMode={() => void backToMode()}
        playArea={playArea}
      />

      <GameOverOverlays
        phase={phase}
        resultOpen={resultOpen}
        profileOpen={gameOverProfileOpen}
        score={totalScore}
        total={total}
        totalRank={totalRank}
        modeName={currentModeName ?? undefined}
        needsSave={needsSave}
        hasNextMode={hasNextMode}
        onNextMode={nextMode}
        onSaveRank={() => { setResultOpen(false); setGameOverProfileOpen(true); }}
        onReplay={replayGame}
        onShare={() => void shareStats()}
        onCloseResult={() => setResultOpen(false)}
        onSaved={(name) => pending.postNow(name)}
        onCloseProfile={() => setGameOverProfileOpen(false)}
      />
    </div>
  );
}
