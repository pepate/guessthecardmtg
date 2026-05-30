import type { ScryfallCard } from '../scryfall/types';

export type RoundStatus = 'playing' | 'won' | 'lost';

export interface TimeAttackConfig {
  /** Time the player has to guess a single card, in ms. */
  durationMs: number;
  /** Total length of one game, in ms — guess as many cards as you can. */
  gameDurationMs: number;
  /** Score awarded for an instant correct guess. */
  maxScore: number;
  /** Score awarded for a correct guess at the last moment. */
  minScore: number;
  /** Length of one reveal stage, in ms. */
  stageMs: number;
  /** How long the continuous reveal (scanner sweep, silhouette, spotlight, zoom) takes
   *  to fully reveal the card, in ms. */
  scanRevealMs: number;
  /** In scanner mode, how long the mana cost stays hidden before auto-revealing, in ms. */
  scanManaRevealMs: number;
  /** Mosaic mode: grid columns and rows of equal tiles (cols*rows = total tiles). */
  mosaicCols: number;
  mosaicRows: number;
  /** Mosaic mode: interval after which one more random tile is uncovered, in ms. */
  mosaicTileMs: number;
  /** Number of name choices (incl. the correct one). */
  optionCount: number;
  /** How many cards to pre-plan — an upper bound on cards a fast player can reach
   *  in one game, kept high enough that names never repeat within a game. */
  totalRounds: number;
}

export const DEFAULT_TIME_ATTACK_CONFIG: TimeAttackConfig = {
  durationMs: 15000,
  gameDurationMs: 90000,
  maxScore: 1000,
  minScore: 100,
  stageMs: 3000,
  scanRevealMs: 5000,
  scanManaRevealMs: 5000,
  mosaicCols: 4,
  mosaicRows: 6,
  mosaicTileMs: 500,
  optionCount: 4,
  totalRounds: 40,
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
