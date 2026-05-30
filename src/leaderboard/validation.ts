export const NAME_MIN = 3;
export const NAME_MAX = 16;

const MAX_CORRECT = 40;
const MIN_PER_CARD = 100;
const MAX_PER_CARD = 1000;

/** Trim, collapse whitespace, strip control chars, cap length. Null if too short. */
export function sanitizeName(raw: string): string | null {
  const cleaned = raw
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const capped = cleaned.slice(0, NAME_MAX).trim();
  return capped.length >= NAME_MIN ? capped : null;
}

/** Plausibility bounds derived from the time-attack scoring rules. */
export function validateScore(score: number, correct: number): boolean {
  if (!Number.isInteger(score) || !Number.isInteger(correct)) return false;
  if (correct < 0 || correct > MAX_CORRECT) return false;
  if (correct === 0) return score === 0;
  return score >= correct * MIN_PER_CARD && score <= correct * MAX_PER_CARD;
}

export function validateSubmission(p: {
  name: string;
  score: number;
  correct: number;
  pool: string;
}): boolean {
  if (p.pool !== 'popular' && p.pool !== 'all') return false;
  if (sanitizeName(p.name) === null) return false;
  return validateScore(p.score, p.correct);
}
