import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { PoolKind } from '../state/highscores';
import type { GlobalEntry, SubmitPayload } from './types';

let cached: SupabaseClient | null | undefined;

function getClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  cached = url && key ? createClient(url, key) : null;
  return cached;
}

export function isLeaderboardEnabled(): boolean {
  return getClient() !== null;
}

interface Row {
  id: string;
  name: string;
  score: number;
  correct: number;
  pool: PoolKind;
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
    country: r.country,
    createdAt: new Date(r.created_at).getTime(),
  };
}

export async function fetchTopScores(pool: PoolKind, limit = 5): Promise<GlobalEntry[]> {
  const c = getClient();
  if (!c) return [];
  const { data, error } = await c
    .from('leaderboard_top')
    .select('id,name,score,correct,pool,country,created_at')
    .eq('pool', pool)
    .order('score', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(toEntry);
}

export async function fetchProjectedRank(
  pool: PoolKind,
  score: number,
): Promise<{ rank: number; total: number }> {
  const c = getClient();
  if (!c) return { rank: 1, total: 0 };
  const higher = await c
    .from('leaderboard_top')
    .select('id', { count: 'exact', head: true })
    .eq('pool', pool)
    .gt('score', score);
  if (higher.error) throw new Error(higher.error.message);
  const all = await c
    .from('leaderboard_top')
    .select('id', { count: 'exact', head: true })
    .eq('pool', pool);
  if (all.error) throw new Error(all.error.message);
  return { rank: (higher.count ?? 0) + 1, total: all.count ?? 0 };
}

export type SubmitResult =
  | { ok: true; id: string; rank: number }
  | { ok: false; reason: string };

export async function submitScore(payload: SubmitPayload): Promise<SubmitResult> {
  const c = getClient();
  if (!c) return { ok: false, reason: 'disabled' };
  const { data, error } = await c.functions.invoke('submit-score', { body: payload });
  if (error) return { ok: false, reason: error.message };
  if (!data || data.ok !== true) return { ok: false, reason: data?.reason ?? 'rejected' };
  return { ok: true, id: data.id, rank: data.rank };
}
