import { getSupabase } from '../supabase/client';
import { getUserId } from '../leaderboard/identity';
import { getModeById } from './client';
import type { CustomMode } from './types';

// Upper bound on device rows pulled before de-duplicating to distinct modes.
const RECENT_FETCH_CAP = 80;

/** Distinct mode_ids in row order (newest first), capped at `limit`. */
export function recentDistinctIds(rows: { mode_id: string }[], limit: number): string[] {
  const ids: string[] = [];
  for (const r of rows) {
    if (!ids.includes(r.mode_id)) ids.push(r.mode_id);
    if (ids.length >= limit) break;
  }
  return ids;
}

/** `primary`, then `extra` entries not already present, capped at `limit`. */
export function fillToLimit(primary: CustomMode[], extra: CustomMode[], limit: number): CustomMode[] {
  const out = [...primary];
  for (const m of extra) {
    if (out.length >= limit) break;
    if (!out.some((x) => x.id === m.id)) out.push(m);
  }
  return out.slice(0, limit);
}

/** The current device's most-recently-played games (modes), newest first. */
export async function fetchRecentGames(limit = 4): Promise<CustomMode[]> {
  const c = getSupabase();
  if (!c) return [];
  const uid = await getUserId().catch(() => null);
  if (!uid) return [];
  const { data, error } = await c
    .from('leaderboard_top')
    .select('mode_id,created_at')
    .eq('device_id', uid)
    .order('created_at', { ascending: false })
    .limit(RECENT_FETCH_CAP);
  if (error || !data) return [];
  const ids = recentDistinctIds(data as { mode_id: string }[], limit);
  const modes = await Promise.all(ids.map((id) => getModeById(id).catch(() => null)));
  return modes.filter((m): m is CustomMode => m != null);
}
