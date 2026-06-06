// The reveal-mode domain primitive. Kept in its own dependency-free module so
// the many features keyed by reveal (leaderboard, profile stats, share links,
// deeplinks, UI) can import the type/constant without pulling in the engine's
// rendering logic in timeAttack.ts. timeAttack.ts re-exports both for back-compat.

export type RevealMode = 'blur' | 'scanner' | 'mosaic' | 'zoom' | 'silhouette' | 'spotlight' | 'gallery';

/** Canonical list of every implemented reveal mode (used to validate DB toggles). */
export const KNOWN_REVEAL_MODES: RevealMode[] = ['blur', 'scanner', 'mosaic', 'zoom', 'silhouette', 'spotlight', 'gallery'];
