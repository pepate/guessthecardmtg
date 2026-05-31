import type { RevealMode } from '../engine/timeAttack';

export interface GlobalEntry {
  id: string;
  name: string;
  score: number;
  correct: number;
  /** Reveal modes this person has a score in, ordered by points (highest first). */
  gameModes: RevealMode[];
  /** ISO 3166-1 alpha-2 (uppercase), or null when unknown. */
  country: string | null;
  /** Epoch milliseconds. */
  createdAt: number;
}

export interface SubmitPayload {
  name: string;
  score: number;
  correct: number;
  modeId: string;
  gameMode: RevealMode;
  deviceId: string;
}
