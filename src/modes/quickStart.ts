import { listModes } from './client';
import { useGameStore } from '../state/gameStore';
import type { RevealMode } from '../engine/revealMode';

/**
 * Start a game in the mode with the most leaderboard entries, so a newcomer
 * lands in a populated game with a real ranking. Returns false if no mode is
 * available (e.g. leaderboard disabled).
 */
export async function startMostPlayedGame(reveal: RevealMode = 'blur'): Promise<boolean> {
  const modes = await listModes(200);
  if (modes.length === 0) return false;
  const target = modes.reduce((a, b) => (b.entry_count > a.entry_count ? b : a));
  const store = useGameStore.getState();
  store.setRevealChoice(reveal);
  await store.selectPool({ kind: 'custom', modeId: target.id, filter: target.filter, name: target.name });
  return true;
}

/**
 * Start a fully random game: a uniformly random mode from all available, with a
 * random enabled reveal mode (`'random'` is resolved by the store at start).
 * Returns false if no mode is available.
 */
export async function startRandomGame(): Promise<boolean> {
  const modes = await listModes(200);
  if (modes.length === 0) return false;
  const target = modes[Math.floor(Math.random() * modes.length)];
  const store = useGameStore.getState();
  store.setRevealChoice('random');
  await store.selectPool({ kind: 'custom', modeId: target.id, filter: target.filter, name: target.name });
  return true;
}
