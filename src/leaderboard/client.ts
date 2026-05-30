import { getSupabase } from '../supabase/client';
import type { GlobalEntry, SubmitPayload } from './types';
import type { RevealMode } from '../engine/timeAttack';

export function isLeaderboardEnabled(): boolean {
  return getSupabase() !== null;
}

interface Row {
  id: string;
  name: string;
  score: number;
  correct: number;
  mode_id: string;
  game_mode: string | null;
  country: string | null;
  created_at: string;
}

function toEntry(r: Row): GlobalEntry {
  return {
    id: r.id,
    name: r.name,
    score: r.score,
    correct: r.correct,
    gameMode: (r.game_mode as RevealMode | null) ?? null,
    country: r.country,
    createdAt: new Date(r.created_at).getTime(),
  };
}

export async function fetchModeTopScores(
  modeId: string,
  limit = 5,
  since: number | null = null,
): Promise<GlobalEntry[]> {
  const c = getSupabase();
  if (!c) return [];
  let q = c
    .from('leaderboard_top')
    .select('id,name,score,correct,mode_id,game_mode,country,created_at')
    .eq('mode_id', modeId);
  if (since != null) q = q.gte('created_at', new Date(since).toISOString());
  const { data, error } = await q
    .order('score', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(toEntry);
}

export async function fetchModeProjectedRank(
  modeId: string,
  score: number,
): Promise<{ rank: number; total: number }> {
  const c = getSupabase();
  if (!c) return { rank: 1, total: 0 };
  const higher = await c
    .from('leaderboard_top')
    .select('id', { count: 'exact', head: true })
    .eq('mode_id', modeId)
    .gt('score', score);
  if (higher.error) throw new Error(higher.error.message);
  const all = await c
    .from('leaderboard_top')
    .select('id', { count: 'exact', head: true })
    .eq('mode_id', modeId);
  if (all.error) throw new Error(all.error.message);
  return { rank: (higher.count ?? 0) + 1, total: all.count ?? 0 };
}

export type SubmitResult =
  | { ok: true; id: string; rank: number }
  | { ok: false; reason: string };

export async function submitScore(payload: SubmitPayload): Promise<SubmitResult> {
  const c = getSupabase();
  if (!c) return { ok: false, reason: 'disabled' };
  const body = {
    name: payload.name,
    score: payload.score,
    correct: payload.correct,
    mode_id: payload.modeId,
    game_mode: payload.gameMode,
  };
  const { data, error } = await c.functions.invoke('submit-score', { body });
  if (error) return { ok: false, reason: error.message };
  if (!data || data.ok !== true) return { ok: false, reason: data?.reason ?? 'rejected' };
  return { ok: true, id: data.id, rank: data.rank };
}
