import { create } from 'zustand';
import type { Round, TimeAttackConfig } from '../engine/types';
import { DEFAULT_TIME_ATTACK_CONFIG } from '../engine/types';
import { createRound, resolveGuess, expire as expireRound } from '../engine/timeAttack';
import { fetchCandidates } from '../scryfall/client';
import type { PoolSelection, ScryfallCard } from '../scryfall/types';
import { loadHighscores, saveHighscore, type HighscoreEntry } from './highscores';

export type GamePhase = 'idle' | 'loading' | 'playing' | 'error' | 'gameover';

interface GameState {
  config: TimeAttackConfig;
  phase: GamePhase;
  error: string | null;

  pool: ScryfallCard[];
  round: Round | null;
  /** 0-based index of the current card within the game. */
  roundIndex: number;

  correctCount: number;
  totalScore: number;
  /** Points earned on the most recent guess (drives the snackbar). */
  earned: number;
  /** Bumped on every resolved guess so the snackbar can re-trigger. */
  earnedSeq: number;

  highscores: HighscoreEntry[];

  selectPool: (selection: PoolSelection) => Promise<void>;
  guessName: (name: string) => void;
  /** Called by the game clock when the timer reaches durationMs. */
  expire: () => void;
  /** Move to the next card, or end the game after the final round. */
  advance: () => void;
  /** Start a fresh game on the same pool. */
  restart: () => void;
  reset: () => void;
}

function draw(pool: ScryfallCard[], config: TimeAttackConfig, now: number): Round {
  const target = pool[Math.floor(Math.random() * pool.length)];
  return createRound(target, pool, now, config);
}

export const useGameStore = create<GameState>((set, get) => ({
  config: DEFAULT_TIME_ATTACK_CONFIG,
  phase: 'idle',
  error: null,

  pool: [],
  round: null,
  roundIndex: 0,

  correctCount: 0,
  totalScore: 0,
  earned: 0,
  earnedSeq: 0,

  highscores: loadHighscores(),

  async selectPool(selection) {
    set({ phase: 'loading', error: null });
    try {
      const { config } = get();
      const pool = await fetchCandidates(selection);
      if (pool.length < config.optionCount) {
        throw new Error('Zu wenige Karten im gewählten Pool.');
      }
      set({
        pool,
        round: draw(pool, config, Date.now()),
        roundIndex: 0,
        correctCount: 0,
        totalScore: 0,
        earned: 0,
        phase: 'playing',
      });
    } catch (err) {
      set({ phase: 'error', error: err instanceof Error ? err.message : 'Unbekannter Fehler' });
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
    const { pool, config, round, roundIndex, totalScore, correctCount } = get();
    if (!round || round.status === 'playing') return;
    const nextIndex = roundIndex + 1;
    if (nextIndex >= config.totalRounds) {
      const highscores = saveHighscore({
        score: totalScore,
        correct: correctCount,
        total: config.totalRounds,
        date: Date.now(),
      });
      set({ phase: 'gameover', round: null, highscores });
      return;
    }
    set({ round: draw(pool, config, Date.now()), roundIndex: nextIndex });
  },

  restart() {
    const { pool, config } = get();
    if (pool.length < config.optionCount) {
      set({ phase: 'idle' });
      return;
    }
    set({
      round: draw(pool, config, Date.now()),
      roundIndex: 0,
      correctCount: 0,
      totalScore: 0,
      earned: 0,
      phase: 'playing',
    });
  },

  reset() {
    set({
      phase: 'idle',
      error: null,
      pool: [],
      round: null,
      roundIndex: 0,
      correctCount: 0,
      totalScore: 0,
      earned: 0,
      highscores: loadHighscores(),
    });
  },
}));
