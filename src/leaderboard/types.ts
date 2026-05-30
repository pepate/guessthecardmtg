export interface GlobalEntry {
  id: string;
  name: string;
  score: number;
  correct: number;
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
}
