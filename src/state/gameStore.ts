import { create } from 'zustand';
import type { Round, TimeAttackConfig } from '../engine/types';
import { DEFAULT_TIME_ATTACK_CONFIG } from '../engine/types';
import { createRound, resolveGuess, expire as expireRound } from '../engine/timeAttack';
import { fetchCandidates } from '../scryfall/client';
import type { PoolSelection, ScryfallCard } from '../scryfall/types';

export type GamePhase = 'idle' | 'loading' | 'playing' | 'error';

interface GameState {
  config: TimeAttackConfig;
  phase: GamePhase;
  error: string | null;

  poolSelection: PoolSelection | null;
  pool: ScryfallCard[];
  round: Round | null;

  totalScore: number;
  streak: number;
  roundsPlayed: number;

  selectPool: (selection: PoolSelection) => Promise<void>;
  guessName: (name: string) => void;
  /** Called by the game clock when the timer reaches durationMs. */
  expire: () => void;
  nextRound: () => void;
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

  poolSelection: null,
  pool: [],
  round: null,

  totalScore: 0,
  streak: 0,
  roundsPlayed: 0,

  async selectPool(selection) {
    set({ phase: 'loading', error: null, poolSelection: selection });
    try {
      const { config } = get();
      const pool = await fetchCandidates(selection);
      if (pool.length < config.optionCount) {
        throw new Error('Zu wenige Karten im gewählten Pool.');
      }
      set({ pool, round: draw(pool, config, Date.now()), phase: 'playing' });
    } catch (err) {
      set({ phase: 'error', error: err instanceof Error ? err.message : 'Unbekannter Fehler' });
    }
  },

  guessName(name) {
    const { round, config, totalScore, streak, roundsPlayed } = get();
    if (!round || round.status !== 'playing') return;
    const next = resolveGuess(round, name, Date.now(), config);

    const patch: Partial<GameState> = { round: next };
    if (next.status === 'won') {
      patch.totalScore = totalScore + next.score;
      patch.streak = streak + 1;
      patch.roundsPlayed = roundsPlayed + 1;
    } else if (next.status === 'lost') {
      patch.streak = 0;
      patch.roundsPlayed = roundsPlayed + 1;
    }
    set(patch);
  },

  expire() {
    const { round, roundsPlayed } = get();
    if (!round || round.status !== 'playing') return;
    set({ round: expireRound(round), streak: 0, roundsPlayed: roundsPlayed + 1 });
  },

  nextRound() {
    const { pool, config } = get();
    if (pool.length < config.optionCount) return;
    set({ round: draw(pool, config, Date.now()), phase: 'playing' });
  },

  reset() {
    set({
      phase: 'idle',
      error: null,
      poolSelection: null,
      pool: [],
      round: null,
      totalScore: 0,
      streak: 0,
      roundsPlayed: 0,
    });
  },
}));
