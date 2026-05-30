import { getSupabase } from '../supabase/client';
import type { PoolKind } from '../state/highscores';
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
  pool: PoolKind;
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
    pool: r.pool,
    gameMode: (r.game_mode as RevealMode | null) ?? null,
    country: r.country,
    createdAt: new Date(r.created_at).getTime(),
  };
}

export async function fetchTopScores(
  pool: PoolKind,
  limit = 5,
  since: number | null = null,
  gameMode?: RevealMode,
): Promise<GlobalEntry[]> {
  const c = getSupabase();
  if (!c) return [];
  let q = c
    .from('leaderboard_top')
    .select('id,name,score,correct,pool,game_mode,country,created_at')
    .eq('pool', pool);
  if (gameMode) q = q.eq('game_mode', gameMode);
  if (since != null) q = q.gte('created_at', new Date(since).toISOString());
  const { data, error } = await q
    .order('score', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(toEntry);
}

export async function fetchProjectedRank(
  pool: PoolKind,
  score: number,
  gameMode?: RevealMode,
): Promise<{ rank: number; total: number }> {
  const c = getSupabase();
  if (!c) return { rank: 1, total: 0 };
  let higherQ = c.from('leaderboard_top').select('id', { count: 'exact', head: true }).eq('pool', pool).gt('score', score);
  if (gameMode) higherQ = higherQ.eq('game_mode', gameMode);
  const higher = await higherQ;
  if (higher.error) throw new Error(higher.error.message);
  let allQ = c.from('leaderboard_top').select('id', { count: 'exact', head: true }).eq('pool', pool);
  if (gameMode) allQ = allQ.eq('game_mode', gameMode);
  const all = await allQ;
  if (all.error) throw new Error(all.error.message);
  return { rank: (higher.count ?? 0) + 1, total: all.count ?? 0 };
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
    .select('id,name,score,correct,pool,game_mode,country,created_at')
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
  const body = { name: payload.name, score: payload.score, correct: payload.correct, pool: payload.pool, game_mode: payload.gameMode, ...(payload.modeId ? { mode_id: payload.modeId } : {}) };
  const { data, error } = await c.functions.invoke('submit-score', { body });
  if (error) return { ok: false, reason: error.message };
  if (!data || data.ok !== true) return { ok: false, reason: data?.reason ?? 'rejected' };
  return { ok: true, id: data.id, rank: data.rank };
}
