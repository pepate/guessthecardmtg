import { create } from 'zustand';
import type { Round, TimeAttackConfig } from '../engine/types';
import { DEFAULT_TIME_ATTACK_CONFIG } from '../engine/types';
import { planGame, resolveGuess, expire as expireRound, type PlannedRound } from '../engine/timeAttack';
import { fetchCandidates } from '../scryfall/client';
import type { PoolSelection, ScryfallCard } from '../scryfall/types';
import { loadHighscores, saveHighscore, type HighscoreEntry, type PoolKind } from './highscores';
import { decodeResult, type SharedResult } from '../share/score';

export type GamePhase = 'idle' | 'loading' | 'playing' | 'error' | 'gameover';

interface GameState {
  config: TimeAttackConfig;
  phase: GamePhase;
  error: string | null;

  pool: ScryfallCard[];
  /** Which pool the current game is played on (recorded in highscores). */
  poolKind: PoolKind;
  /** The selection that built the current game, so "play again" can re-fetch. */
  lastSelection: PoolSelection | null;
  /** The whole game pre-planned so no card or name repeats across rounds. */
  plan: PlannedRound[];
  round: Round | null;
  /** 0-based index of the current card within the game. */
  roundIndex: number;
  /** Date.now() when the 90-second game started. */
  gameStartedAt: number;

  correctCount: number;
  totalScore: number;
  /** Points earned on the most recent guess (drives the snackbar). */
  earned: number;
  /** Bumped on every resolved guess so the snackbar can re-trigger. */
  earnedSeq: number;

  highscores: HighscoreEntry[];
  /** A friend's shared result from a `?r=` link, shown as a challenge banner. */
  challenge: SharedResult | null;

  selectPool: (selection: PoolSelection) => Promise<void>;
  guessName: (name: string) => void;
  /** Called by the game clock when the per-card timer reaches durationMs. */
  expire: () => void;
  /** Move to the next card, or end the game when the plan runs out. */
  advance: () => void;
  /** End the game when the 90-second clock runs out, recording a highscore. */
  endGame: () => void;
  /** Start a fresh game on the same pool. */
  restart: () => void;
  reset: () => void;
}

function startPlanned(planned: PlannedRound, now: number): Round {
  return {
    target: planned.target,
    options: planned.options,
    startedAt: now,
    status: 'playing',
    guess: null,
    score: 0,
  };
}

function uniqueNameCount(pool: ScryfallCard[]): number {
  return new Set(pool.map((c) => c.name)).size;
}

function finishGame(
  state: { totalScore: number; correctCount: number; poolKind: PoolKind },
  set: (partial: Partial<GameState>) => void,
): void {
  const highscores = saveHighscore({
    score: state.totalScore,
    correct: state.correctCount,
    date: Date.now(),
    pool: state.poolKind,
  });
  set({ phase: 'gameover', round: null, highscores });
}

export const useGameStore = create<GameState>((set, get) => ({
  config: DEFAULT_TIME_ATTACK_CONFIG,
  phase: 'idle',
  error: null,

  pool: [],
  poolKind: 'popular',
  lastSelection: null,
  plan: [],
  round: null,
  roundIndex: 0,
  gameStartedAt: 0,

  correctCount: 0,
  totalScore: 0,
  earned: 0,
  earnedSeq: 0,

  highscores: loadHighscores(),
  challenge: decodeResult(new URLSearchParams(window.location.search).get('r')),

  async selectPool(selection) {
    set({ phase: 'loading', error: null });
    try {
      const { config } = get();
      const pool = await fetchCandidates(selection);
      if (uniqueNameCount(pool) < config.optionCount) {
        throw new Error('Not enough cards in the selected pool.');
      }
      const plan = planGame(pool, config);
      set({
        pool,
        poolKind: selection.kind,
        lastSelection: selection,
        plan,
        round: startPlanned(plan[0], Date.now()),
        roundIndex: 0,
        gameStartedAt: Date.now(),
        correctCount: 0,
        totalScore: 0,
        earned: 0,
        phase: 'playing',
      });
    } catch (err) {
      set({ phase: 'error', error: err instanceof Error ? err.message : 'Unknown error' });
    }
  },

  guessName(name) {
    const { round, config, totalScore, correctCount, earnedSeq } = get();
    if (!round || round.status !== 'playing') return;
    const next = resolveGuess(round, name, Date.now(), config);
    const won = next.status === 'won';
    set({
      round: next,
      earned: won ? next.score : 0,
      earnedSeq: earnedSeq + 1,
      totalScore: won ? totalScore + next.score : totalScore,
      correctCount: won ? correctCount + 1 : correctCount,
    });
  },

  expire() {
    const { round } = get();
    if (!round || round.status !== 'playing') return;
    set({ round: expireRound(round), earned: 0 });
  },

  advance() {
    const { plan, round, roundIndex } = get();
    if (!round || round.status === 'playing') return;
    const nextIndex = roundIndex + 1;
    if (nextIndex >= plan.length) {
      finishGame(get(), set);
      return;
    }
    set({ round: startPlanned(plan[nextIndex], Date.now()), roundIndex: nextIndex });
  },

  endGame() {
    const { phase } = get();
    if (phase !== 'playing') return;
    finishGame(get(), set);
  },

  restart() {
    // Re-fetch a fresh pool so "play again" pulls new cards rather than
    // replaying the same slice of the catalogue.
    const { lastSelection } = get();
    if (!lastSelection) {
      set({ phase: 'idle' });
      return;
    }
    void get().selectPool(lastSelection);
  },

  reset() {
    set({
      phase: 'idle',
      error: null,
      pool: [],
      plan: [],
      round: null,
      roundIndex: 0,
      gameStartedAt: 0,
      correctCount: 0,
      totalScore: 0,
      earned: 0,
      highscores: loadHighscores(),
    });
  },
}));
