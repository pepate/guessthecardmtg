export type PoolKind = 'popular' | 'all' | 'custom';

export interface HighscoreEntry {
  /** Total points scored across the game. */
  score: number;
  /** Number of cards guessed correctly within the time limit. */
  correct: number;
  /** Date.now() when the game finished. */
  date: number;
  /** Which card pool the game was played on. */
  pool: PoolKind;
}

const KEY = 'guessthecard.highscores.v3';
const MAX_ENTRIES = 5;
const GAMES_KEY = 'guessthecard.gamesplayed';

/** How many games this player has finished (used to gate mode creation). */
export function getGamesPlayed(): number {
  const n = Number(localStorage.getItem(GAMES_KEY));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Record one more finished game; returns the new total. */
export function bumpGamesPlayed(): number {
  const next = getGamesPlayed() + 1;
  try {
    localStorage.setItem(GAMES_KEY, String(next));
  } catch {
    // Ignore unavailable storage.
  }
  return next;
}

function isEntry(x: unknown): x is HighscoreEntry {
  if (typeof x !== 'object' || x === null) return false;
  const e = x as Record<string, unknown>;
  return (
    typeof e.score === 'number' &&
    typeof e.correct === 'number' &&
    typeof e.date === 'number' &&
    (e.pool === 'popular' || e.pool === 'all' || e.pool === 'custom')
  );
}

// Highest total score first; newer games win ties so a fresh result surfaces.
function rank(a: HighscoreEntry, b: HighscoreEntry): number {
  return b.score - a.score || b.date - a.date;
}

export function loadHighscores(): HighscoreEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry).sort(rank).slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

/** Insert a finished game, keep the top 5 by score, persist, and return the list. */
export function saveHighscore(entry: HighscoreEntry): HighscoreEntry[] {
  const list = [...loadHighscores(), entry].sort(rank).slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Ignore quota / unavailable storage — the game still works without history.
  }
  return list;
}
