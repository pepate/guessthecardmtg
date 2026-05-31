import type { RevealMode } from '../engine/timeAttack';
import type { GlobalEntry } from './types';

/** A single stored run, before it is collapsed into a per-person leaderboard row. */
export interface LeaderboardRun {
  id: string;
  name: string;
  score: number;
  correct: number;
  gameMode: RevealMode | null;
  country: string | null;
  createdAt: number;
  deviceId: string;
}

/** Best of two runs: higher score wins; ties break to the newer run, then by id. */
function better(a: LeaderboardRun, b: LeaderboardRun): LeaderboardRun {
  if (b.score !== a.score) return b.score > a.score ? b : a;
  if (b.createdAt !== a.createdAt) return b.createdAt > a.createdAt ? b : a;
  return b.id > a.id ? b : a;
}

/**
 * Collapse raw runs into one row per name: a person appears once, ranked by their
 * best score. Each reveal mode they have a score in becomes a badge, ordered by the
 * points they earned in it (highest first). Runs without a reveal mode contribute no
 * badge but still count toward the headline score.
 */
export function aggregateByPerson(runs: LeaderboardRun[]): GlobalEntry[] {
  const byName = new Map<string, LeaderboardRun[]>();
  for (const run of runs) {
    const group = byName.get(run.name);
    if (group) group.push(run);
    else byName.set(run.name, [run]);
  }

  const people = [...byName.values()].map((group) => {
    const best = group.reduce(better);

    const bestPerMode = new Map<RevealMode, number>();
    for (const run of group) {
      if (!run.gameMode) continue;
      const prev = bestPerMode.get(run.gameMode);
      if (prev === undefined || run.score > prev) bestPerMode.set(run.gameMode, run.score);
    }
    const gameModes = [...bestPerMode.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([mode]) => mode);

    return {
      id: best.id,
      name: best.name,
      score: best.score,
      correct: best.correct,
      gameModes,
      country: best.country,
      createdAt: best.createdAt,
      deviceId: best.deviceId,
    };
  });

  // Match the prior board ordering: best score first, older runs winning ties.
  people.sort((a, b) => b.score - a.score || a.createdAt - b.createdAt);
  return people;
}
