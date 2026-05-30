import type { PoolKind } from '../state/highscores';
import type { RevealMode } from '../engine/timeAttack';

export interface GlobalEntry {
  id: string;
  name: string;
  score: number;
  correct: number;
  pool: PoolKind;
  gameMode: RevealMode | null;
  /** ISO 3166-1 alpha-2 (uppercase), or null when unknown. */
  country: string | null;
  /** Epoch milliseconds. */
  createdAt: number;
}

export interface SubmitPayload {
  name: string;
  score: number;
  correct: number;
  pool: PoolKind;
  gameMode: RevealMode;
  /** Set only for custom-mode runs; scopes the score to that mode's board. */
  modeId?: string;
}
