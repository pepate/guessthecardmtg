import { getSupabase } from '../supabase/client';
import { listModes } from '../modes/client';
import { fetchModeStandings } from '../leaderboard/client';
import type { RevealMode } from '../engine/timeAttack';

export interface PlayerBest {
  modeId: string;
  modeName: string;
  bestScore: number;
  /** Reveal mode of the best run, or null for legacy runs. */
  reveal: RevealMode | null;
  /** Best rank across this mode's reveals, or null when unranked. */
  rank: number | null;
}

interface Row {
  mode_id: string;
  score: number;
  game_mode: RevealMode | null;
}

/** The player's personal best per mode (highest score), with mode name and rank. */
export async function fetchPlayerBests(uid: string): Promise<PlayerBest[]> {
  const c = getSupabase();
  if (!c) return [];
  const { data, error } = await c
    .from('leaderboard_top')
    .select('mode_id,score,game_mode')
    .eq('device_id', uid);
  if (error || !data) return [];

  const bestByMode = new Map<string, { score: number; reveal: RevealMode | null }>();
  for (const r of data as Row[]) {
    const prev = bestByMode.get(r.mode_id);
    if (!prev || r.score > prev.score) bestByMode.set(r.mode_id, { score: r.score, reveal: r.game_mode });
  }
  if (bestByMode.size === 0) return [];

  const modeIds = [...bestByMode.keys()];
  const [modes, ranks] = await Promise.all([listModes(200), fetchModeStandings(modeIds, uid)]);
  const nameById = new Map(modes.map((m) => [m.id, m.name]));

  return modeIds
    .map((id) => {
      const best = bestByMode.get(id)!;
      return {
        modeId: id,
        modeName: nameById.get(id) ?? 'Unknown mode',
        bestScore: best.score,
        reveal: best.reveal,
        rank: ranks.get(id) ?? null,
      };
    })
    .sort((a, b) => b.bestScore - a.bestScore);
}
