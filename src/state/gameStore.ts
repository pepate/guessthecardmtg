import { create } from 'zustand';
import type { AttributeValue, GameMode, GuessResult, RoundState } from '../engine/types';
import { progressiveReveal } from '../engine/modes/progressiveReveal';
import { fetchCandidates } from '../scryfall/client';
import type { PoolSelection, ScryfallCard } from '../scryfall/types';

export type GamePhase = 'idle' | 'loading' | 'playing' | 'error';

interface GameState {
  mode: GameMode;
  phase: GamePhase;
  error: string | null;

  poolSelection: PoolSelection | null;
  pool: ScryfallCard[];
  round: RoundState | null;

  totalScore: number;
  streak: number;
  roundsPlayed: number;

  /** Last guess result — scene/ watches this to play reveal/win/fail effects. */
  lastResult: GuessResult | null;
  /** Monotonic id so the scene can react even to repeated identical results. */
  resultSeq: number;
  /** Current multiple-choice name options (stable until regenerated). */
  nameOptions: string[];

  selectPool: (selection: PoolSelection) => Promise<void>;
  guessAttribute: (value: AttributeValue) => void;
  guessName: (name: string) => void;
  rollNameChoices: () => void;
  nextRound: () => void;
  reset: () => void;
}

function drawRound(mode: GameMode, pool: ScryfallCard[]): RoundState {
  const target = pool[Math.floor(Math.random() * pool.length)];
  return mode.startRound({ target, pool });
}

export const useGameStore = create<GameState>((set, get) => ({
  mode: progressiveReveal,
  phase: 'idle',
  error: null,

  poolSelection: null,
  pool: [],
  round: null,

  totalScore: 0,
  streak: 0,
  roundsPlayed: 0,

  lastResult: null,
  resultSeq: 0,
  nameOptions: [],

  async selectPool(selection) {
    set({ phase: 'loading', error: null, poolSelection: selection });
    try {
      const pool = await fetchCandidates(selection);
      if (pool.length < 2) throw new Error('Zu wenige Karten im gewählten Pool.');
      const { mode } = get();
      const round = drawRound(mode, pool);
      set({
        pool,
        round,
        phase: 'playing',
        nameOptions: mode.nameChoices(round),
        lastResult: null,
      });
    } catch (err) {
      set({ phase: 'error', error: err instanceof Error ? err.message : 'Unbekannter Fehler' });
    }
  },

  guessAttribute(value) {
    const { mode, round, resultSeq } = get();
    if (!round || round.status !== 'playing') return;
    const { round: next, result } = mode.guessAttribute(round, value);
    set({
      round: next,
      lastResult: result,
      resultSeq: resultSeq + 1,
      nameOptions: mode.nameChoices(next),
    });
  },

  guessName(name) {
    const { mode, round, resultSeq, totalScore, streak, roundsPlayed } = get();
    if (!round || round.status !== 'playing') return;
    const { round: next, result } = mode.guessName(round, name);

    const patch: Partial<GameState> = {
      round: next,
      lastResult: result,
      resultSeq: resultSeq + 1,
    };
    if (next.status === 'won') {
      patch.totalScore = totalScore + mode.score(next);
      patch.streak = streak + 1;
      patch.roundsPlayed = roundsPlayed + 1;
    } else if (next.status === 'lost') {
      patch.streak = 0;
      patch.roundsPlayed = roundsPlayed + 1;
    }
    set(patch);
  },

  rollNameChoices() {
    const { mode, round } = get();
    if (!round) return;
    set({ nameOptions: mode.nameChoices(round) });
  },

  nextRound() {
    const { mode, pool } = get();
    if (pool.length < 2) return;
    const round = drawRound(mode, pool);
    set({
      round,
      phase: 'playing',
      lastResult: null,
      nameOptions: mode.nameChoices(round),
    });
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
      lastResult: null,
      resultSeq: 0,
      nameOptions: [],
    });
  },
}));
