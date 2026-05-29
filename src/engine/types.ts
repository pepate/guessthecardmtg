import type { Color, ScryfallCard } from '../scryfall/types';

export type AttributeKind = 'color' | 'cmc' | 'type' | 'power';

/** Value the player submits when guessing an attribute. */
export type AttributeValue =
  | { kind: 'color'; value: Color[] }
  | { kind: 'cmc'; value: number }
  | { kind: 'type'; value: string }
  | { kind: 'power'; value: number };

export interface AttributeDef {
  kind: AttributeKind;
  label: string;
}

export interface ScoreConfig {
  startBudget: number;
  revealCost: number;
  wrongAttributeCost: number;
  wrongNameCost: number;
}

export const DEFAULT_SCORE_CONFIG: ScoreConfig = {
  startBudget: 1000,
  revealCost: 150,
  wrongAttributeCost: 50,
  wrongNameCost: 200,
};

export type RoundStatus = 'playing' | 'won' | 'lost';

/**
 * Full state of one round. The engine is pure: every mode method takes a
 * RoundState and returns a new one, so it can be unit-tested without React
 * or a store and re-used as Zustand state.
 */
export interface RoundState {
  target: ScryfallCard;
  /** target + distractor cards drawn from the pool, used to build choices. */
  pool: ScryfallCard[];
  reveals: Record<AttributeKind, boolean>;
  budget: number;
  wrongAttempts: { attribute: number; name: number };
  status: RoundStatus;
}

export interface GuessResult {
  correct: boolean;
  /** Set when a correct attribute guess revealed something. */
  revealedAttribute?: AttributeKind;
  /** True when the round was won by guessing the name. */
  roundWon?: boolean;
  /** True when the round ended (won, or budget exhausted). */
  roundOver?: boolean;
  scoreDelta: number;
  /** Remaining round budget after applying this guess. */
  budget: number;
}

export interface StartRoundInput {
  target: ScryfallCard;
  pool: ScryfallCard[];
  config?: ScoreConfig;
}

/**
 * Core extensibility seam. A new game mode is a new implementation of this
 * interface in engine/modes/ — the UI only knows GameMode, never a concrete mode.
 */
export interface GameMode {
  readonly id: string;
  startRound(input: StartRoundInput): RoundState;
  /** Attributes that are still hidden and therefore guessable. */
  revealableAttributes(round: RoundState): AttributeKind[];
  guessAttribute(
    round: RoundState,
    value: AttributeValue,
  ): { round: RoundState; result: GuessResult };
  /** Name options, kept consistent with already-revealed attributes. */
  nameChoices(round: RoundState): string[];
  guessName(round: RoundState, name: string): { round: RoundState; result: GuessResult };
  /** Final/current score for the round. */
  score(round: RoundState): number;
}
