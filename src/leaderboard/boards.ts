import { KNOWN_REVEAL_MODES } from '../engine/revealMode';
import type { RevealMode } from '../engine/revealMode';
import type { GlobalEntry } from './types';

export interface Run {
  id: string;
  name: string;
  score: number;
  correct: number;
  gameMode: RevealMode | null;
  deviceId: string;
  country: string | null;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Among two runs from the same device, return the "better" one to keep.
 * Higher score wins; ties break to earlier createdAt; ties break to larger id.
 */
function better(a: Run, b: Run): Run {
  if (b.score !== a.score) return b.score > a.score ? b : a;
  if (b.createdAt !== a.createdAt) return a.createdAt < b.createdAt ? a : b;
  return b.id > a.id ? b : a;
}

function runToEntry(run: Run): GlobalEntry {
  return {
    id: run.id,
    name: run.name,
    score: run.score,
    correct: run.correct,
    gameModes: [],
    country: run.country,
    createdAt: run.createdAt,
    deviceId: run.deviceId,
  };
}

// ---------------------------------------------------------------------------
// comboBoard
// ---------------------------------------------------------------------------

/**
 * Distinct devices on ONE (mode, reveal) board: best score per device, ranked.
 * gameModes is set to [] (a combo board is single-reveal; no per-row badge).
 */
export function comboBoard(runs: Run[], reveal: RevealMode): GlobalEntry[] {
  // Filter to runs matching this reveal only
  const filtered = runs.filter((r) => r.gameMode === reveal);

  // Group by deviceId, keep best run per device
  const byDevice = new Map<string, Run>();
  for (const r of filtered) {
    const existing = byDevice.get(r.deviceId);
    byDevice.set(r.deviceId, existing ? better(existing, r) : r);
  }

  // Convert to entries and sort: score desc, then createdAt asc
  const entries = [...byDevice.values()].map(runToEntry);
  entries.sort((a, b) => b.score - a.score || a.createdAt - b.createdAt);
  return entries;
}

// ---------------------------------------------------------------------------
// revealLeaders
// ---------------------------------------------------------------------------

/**
 * Rank-1 entry of each reveal's board, or null. Keys = all KNOWN_REVEAL_MODES.
 */
export function revealLeaders(runs: Run[]): Record<RevealMode, GlobalEntry | null> {
  const result = {} as Record<RevealMode, GlobalEntry | null>;
  for (const reveal of KNOWN_REVEAL_MODES) {
    const board = comboBoard(runs, reveal);
    result[reveal] = board.length > 0 ? board[0] : null;
  }
  return result;
}

// ---------------------------------------------------------------------------
// isRank1
// ---------------------------------------------------------------------------

/**
 * True iff this device is the sole rank-1 (top) of the (reveal) board.
 */
export function isRank1(runs: Run[], reveal: RevealMode, deviceId: string): boolean {
  const board = comboBoard(runs, reveal);
  if (board.length === 0) return false;
  return board[0].deviceId === deviceId;
}

// ---------------------------------------------------------------------------
// deviceModeStanding
// ---------------------------------------------------------------------------

/**
 * Device's best (lowest) rank across all reveals of this mode; null if device
 * has no runs here.
 */
export function deviceModeStanding(runs: Run[], deviceId: string): number | null {
  let bestRank: number | null = null;

  for (const reveal of KNOWN_REVEAL_MODES) {
    const board = comboBoard(runs, reveal);
    const idx = board.findIndex((e) => e.deviceId === deviceId);
    if (idx === -1) continue;
    const rank = idx + 1;
    if (bestRank === null || rank < bestRank) bestRank = rank;
  }

  return bestRank;
}

// ---------------------------------------------------------------------------
// pickAutoAdvance
// ---------------------------------------------------------------------------

/**
 * Auto-advance target across modes: a (mode,reveal) where the device is NOT rank-1
 * AND the board has >=1 score from a DIFFERENT device, preferring the combo where
 * this device has the fewest points (0 if none). Deterministic tiebreak: lowest
 * device points, then mode insertion order of runsByMode, then KNOWN_REVEAL_MODES order.
 * Returns null if no combo qualifies.
 */
export function pickAutoAdvance(
  runsByMode: Map<string, Run[]>,
  deviceId: string,
  reveals: RevealMode[],
): { modeId: string; reveal: RevealMode } | null {
  let bestPoints: number | null = null;
  let bestResult: { modeId: string; reveal: RevealMode } | null = null;

  for (const [modeId, runs] of runsByMode) {
    for (const reveal of reveals) {
      const board = comboBoard(runs, reveal);

      // Must have at least one entry from a different device
      const hasOtherDevice = board.some((e) => e.deviceId !== deviceId);
      if (!hasOtherDevice) continue;

      // Device must not be rank-1
      if (isRank1(runs, reveal, deviceId)) continue;

      // Device's points in this combo (0 if absent)
      const deviceEntry = board.find((e) => e.deviceId === deviceId);
      const devicePoints = deviceEntry?.score ?? 0;

      // Prefer fewest device points; tiebreak is already handled by iteration order
      if (bestPoints === null || devicePoints < bestPoints) {
        bestPoints = devicePoints;
        bestResult = { modeId, reveal };
      }
    }
  }

  return bestResult;
}

// ---------------------------------------------------------------------------
// summed-per-reveal aggregation
// ---------------------------------------------------------------------------

/** Per-device total = sum of best score per reveal mode. One entry per device,
 *  ranked by total desc, ties by earliest run, then deviceId for determinism.
 *  Runs without a reveal mode are ignored. */
export function summedBoard(runs: Run[]): GlobalEntry[] {
  const byDevice = new Map<string, Run[]>();
  for (const run of runs) {
    if (!run.gameMode) continue;
    const g = byDevice.get(run.deviceId);
    if (g) g.push(run);
    else byDevice.set(run.deviceId, [run]);
  }
  const entries: GlobalEntry[] = [];
  for (const [deviceId, group] of byDevice) {
    const bestPerReveal = new Map<RevealMode, Run>();
    for (const run of group) {
      const reveal = run.gameMode as RevealMode;
      const prev = bestPerReveal.get(reveal);
      if (!prev || run.score > prev.score) bestPerReveal.set(reveal, run);
    }
    const total = [...bestPerReveal.values()].reduce((sum, run) => sum + run.score, 0);
    const best = group.reduce((a, b) => (b.score > a.score ? b : a));
    const earliest = group.reduce((a, b) => (b.createdAt < a.createdAt ? b : a));
    const gameModes = [...bestPerReveal.entries()].sort((a, b) => b[1].score - a[1].score).map(([m]) => m);
    entries.push({
      id: best.id, name: best.name, score: total, correct: best.correct,
      gameModes, country: best.country, createdAt: earliest.createdAt, deviceId,
    });
  }
  entries.sort((a, b) => b.score - a.score || a.createdAt - b.createdAt || (a.deviceId < b.deviceId ? -1 : 1));
  return entries;
}

/** A device's best score per reveal mode (reveal absent ⇒ not in the map). */
export function ownBestPerReveal(runs: Run[], deviceId: string): Map<RevealMode, number> {
  const m = new Map<RevealMode, number>();
  for (const run of runs) {
    if (!run.gameMode || run.deviceId !== deviceId) continue;
    const prev = m.get(run.gameMode);
    if (prev === undefined || run.score > prev) m.set(run.gameMode, run.score);
  }
  return m;
}

/** 1-based rank of a device in a summed board, or null when absent. */
export function summedRank(board: GlobalEntry[], deviceId: string): number | null {
  const i = board.findIndex((e) => e.deviceId === deviceId);
  return i === -1 ? null : i + 1;
}

/** Projected pool total + rank if `newScore` were applied to `reveal` for `deviceId`. */
export function projectedSummedRank(
  runs: Run[],
  deviceId: string,
  reveal: RevealMode,
  newScore: number,
): { total: number; rank: number } {
  const own = ownBestPerReveal(runs, deviceId);
  own.set(reveal, Math.max(own.get(reveal) ?? 0, newScore));
  const total = [...own.values()].reduce((sum, v) => sum + v, 0);
  const others = summedBoard(runs.filter((rr) => rr.deviceId !== deviceId));
  const higher = others.filter((e) => e.score > total).length;
  return { total, rank: higher + 1 };
}

/** First enabled reveal the device has zero points in (enabled order), or null. */
export function nextZeroReveal(own: Map<RevealMode, number>, enabled: RevealMode[]): RevealMode | null {
  for (const reveal of enabled) {
    if ((own.get(reveal) ?? 0) === 0) return reveal;
  }
  return null;
}
