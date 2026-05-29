import type { ScryfallCard } from '../scryfall/types';

export type RoundStatus = 'playing' | 'won' | 'lost';

export interface TimeAttackConfig {
  /** Total time the player has to guess, in ms. */
  durationMs: number;
  /** Score awarded for an instant correct guess. */
  maxScore: number;
  /** Score awarded for a correct guess at the last moment. */
  minScore: number;
  /** Length of one reveal stage, in ms. */
  stageMs: number;
  /** Number of name choices (incl. the correct one). */
  optionCount: number;
  /** How many cards make up one game. */
  totalRounds: number;
}

export const DEFAULT_TIME_ATTACK_CONFIG: TimeAttackConfig = {
  durationMs: 15000,
  maxScore: 1000,
  minScore: 100,
  stageMs: 3000,
  optionCount: 4,
  totalRounds: 15,
};

/**
 * How much of the card is shown:
 * 0 = artwork only
 * 1 = full card in color, every info region blurred
 * 2 = + type line
 * 3 = + mana cost
 * 4 = + full text + power
 * 5 = time is up / everything (round over)
 */
export type RevealStage = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * One round of the time-attack mode. The engine is pure: every function takes
 * a Round (plus a clock value) and returns a new Round, so it can be unit-tested
 * without React or a store.
 */
export interface Round {
  target: ScryfallCard;
  /** optionCount names including the target, shuffled. */
  options: string[];
  /** Date.now() at the moment the round started. */
  startedAt: number;
  status: RoundStatus;
  /** The option the player chose, or null while still playing / on timeout. */
  guess: string | null;
  /** Points awarded once resolved (0 while playing or on a miss). */
  score: number;
}
