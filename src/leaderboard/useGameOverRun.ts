import { usePendingRun } from './usePendingRun';
import type { GamePhase } from '../state/gameStore';
import type { RevealMode } from '../engine/revealMode';
import type { CustomFilter } from '../modes/filter';

interface GameOverRunOpts {
  phase: GamePhase;
  totalScore: number;
  correctCount: number;
  roundIndex: number;
  gameMode: RevealMode;
  modeId: string | null;
  filter: CustomFilter | null;
  dailyReveal: RevealMode | null;
  /** Tapping the LOGIN affordance on the pending row. */
  onLogin: () => void;
}

/**
 * Bundles the game-over run state: holds the just-finished run, derives its
 * projected leaderboard row, and the values the result modal needs (summed
 * total, rank, whether a save/next-mode is offered). Keeps App() a thin wiring
 * layer instead of a cluster of `??`/ternary derivations.
 */
export function useGameOverRun(opts: GameOverRunOpts) {
  const pendingRunInput =
    opts.phase === 'gameover' && opts.totalScore > 0
      ? { score: opts.totalScore, correct: opts.correctCount, cards: opts.roundIndex + 1, gameMode: opts.gameMode }
      : null;
  const pending = usePendingRun(pendingRunInput, opts.modeId, opts.filter);

  const pendingRow =
    pendingRunInput && pending.projectedRank != null
      ? {
          rank: pending.postedRank ?? pending.projectedRank,
          name: pending.needsLogin ? null : pending.name,
          score: pendingRunInput.score,
          total: pending.projectedTotal ?? pendingRunInput.score,
          correct: pendingRunInput.correct,
          gameMode: pendingRunInput.gameMode,
          onLogin: opts.onLogin,
        }
      : null;

  return {
    pending,
    pendingRow,
    total: pending.projectedTotal ?? opts.totalScore,
    totalRank: pending.postedRank ?? pending.projectedRank,
    needsSave: pending.needsLogin,
    hasNextMode: !opts.dailyReveal && pending.nextMode != null,
  };
}
