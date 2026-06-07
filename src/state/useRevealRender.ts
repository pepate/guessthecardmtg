import { useGameStore } from './gameStore';
import { useGameClock, useGameTimeLeft } from './useGameClock';
import { stageAt, scanProgressAt, scanAngleFor, tilesRevealedAt, tileOrderFor, spotlightOriginFor } from '../engine/timeAttack';
import type { RevealMode } from '../engine/revealMode';
import type { CardStageReveal } from '../ui/AppShell';

export interface RevealRender {
  elapsedMs: number;
  timeLeftMs: number;
  playingNow: boolean;
  mode: RevealMode;
  /** The per-round props CardStage needs (everything but `wide`/`mode`). */
  cardStage: CardStageReveal;
}

/**
 * Derives every per-round reveal value the view needs from the game clock + store:
 * the current stage, scan progress/angle, mana/text redaction windows, mosaic tile
 * reveal, and spotlight origin. Kept out of App() so the component stays a thin
 * wiring layer rather than a tangle of clock-driven ternaries.
 */
export function useRevealRender(): RevealRender {
  const phase = useGameStore((s) => s.phase);
  const round = useGameStore((s) => s.round);
  const roundIndex = useGameStore((s) => s.roundIndex);
  const gameMode = useGameStore((s) => s.gameMode);
  const revealSeed = useGameStore((s) => s.revealSeed);
  const config = useGameStore((s) => s.config);

  const elapsedMs = useGameClock();
  const timeLeftMs = useGameTimeLeft();
  const playingNow = phase === 'playing' && round?.status === 'playing';
  const tileCount = config.mosaicCols * config.mosaicRows;
  // Cards often print their own name in the rules text — keep the text box redacted
  // early (same 5s window as mana) in the spatial-reveal modes so it can't leak the answer.
  const earlyRedaction = playingNow && elapsedMs < config.scanManaRevealMs;

  const cardStage: CardStageReveal = {
    stage: playingNow ? stageAt(elapsedMs, config) : 5,
    progress: playingNow ? scanProgressAt(elapsedMs, config) : 1,
    angle: scanAngleFor(revealSeed, roundIndex),
    manaHidden: earlyRedaction,
    textHidden: earlyRedaction,
    spotlightOrigin: spotlightOriginFor(revealSeed, roundIndex),
    tileOrder: tileOrderFor(revealSeed, roundIndex, tileCount),
    tilesRevealed: playingNow ? tilesRevealedAt(elapsedMs, config) : tileCount,
  };

  return { elapsedMs, timeLeftMs, playingNow, mode: gameMode, cardStage };
}
