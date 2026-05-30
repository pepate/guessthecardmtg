import { getSupabase } from '../supabase/client';

export interface SetListItem {
  code: string;
  name: string;
  releasedAt: string | null;
  eligibleCount: number;
  modeId: string | null;
  championName: string | null;
  championScore: number | null;
  entryCount: number;
  lastActivity: string | null;
}

interface SetListRow {
  code: string;
  name: string;
  released_at: string | null;
  eligible_count: number;
  mode_id: string | null;
  champion_name: string | null;
  champion_score: number | null;
  entry_count: number;
  last_activity: string | null;
}

export async function fetchSetList(): Promise<SetListItem[]> {
  const c = getSupabase();
  if (!c) return [];
  const { data, error } = await c.rpc('set_list');
  if (error) throw new Error(error.message);
  return ((data ?? []) as SetListRow[]).map((r) => ({
    code: r.code,
    name: r.name,
    releasedAt: r.released_at,
    eligibleCount: r.eligible_count,
    modeId: r.mode_id,
    championName: r.champion_name,
    championScore: r.champion_score,
    entryCount: Number(r.entry_count),
    lastActivity: r.last_activity,
  }));
}
