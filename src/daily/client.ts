import { getSupabase } from '../supabase/client';
import { getUserId } from '../leaderboard/identity';
import { fetchComboBoard } from '../leaderboard/client';
import type { RevealMode } from '../engine/timeAttack';

export interface DailyLeader { name: string; score: number; country: string | null }
export interface DailyToday {
  day: string;
  modeId: string;
  reveal: RevealMode;
  setCode: string | null;
  setName: string | null;
  leader: DailyLeader | null;
  playsUsed: number;
}

/** Today's Berlin calendar day as YYYY-MM-DD. */
export function berlinToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
}

/** UTC ISO string for the start of today's Berlin day. */
function berlinMidnightIso(): string {
  const berlinNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
  berlinNow.setHours(0, 0, 0, 0);
  return new Date(berlinNow.getTime() - berlinNow.getTimezoneOffset() * 60000).toISOString();
}

interface DailyRow {
  day: string;
  mode_id: string;
  reveal: string;
  // PostgREST embeds a to-one FK as an object; tolerate an array just in case.
  mode: { name: string; filter: { sets?: string[] } } | { name: string; filter: { sets?: string[] } }[] | null;
}

async function compose(row: DailyRow): Promise<DailyToday> {
  const mode = Array.isArray(row.mode) ? row.mode[0] ?? null : row.mode;
  const reveal = row.reveal as RevealMode;
  const board = await fetchComboBoard(row.mode_id, reveal, null, 1).catch(() => []);
  const leader = board[0] ? { name: board[0].name, score: board[0].score, country: board[0].country } : null;

  let playsUsed = 0;
  const c = getSupabase();
  const uid = await getUserId();
  if (c && uid) {
    const { count } = await c
      .from('leaderboard_top')
      .select('id', { count: 'exact', head: true })
      .eq('mode_id', row.mode_id)
      .eq('device_id', uid)
      .gte('created_at', berlinMidnightIso());
    playsUsed = count ?? 0;
  }

  return {
    day: row.day,
    modeId: row.mode_id,
    reveal,
    setCode: mode?.filter?.sets?.[0] ?? null,
    setName: mode?.name ?? null,
    leader,
    playsUsed,
  };
}

/** Read today's daily set (no creation). Null when not created yet. */
export async function fetchDailyToday(): Promise<DailyToday | null> {
  const c = getSupabase();
  if (!c) return null;
  const { data, error } = await c
    .from('daily_set')
    .select('day,mode_id,reveal,mode:mode_id(name,filter)')
    .eq('day', berlinToday())
    .maybeSingle();
  if (error || !data) return null;
  return compose(data as unknown as DailyRow);
}

/** Create-or-get today's daily set via the edge function, then re-read its status. */
export async function ensureDailyToday(): Promise<DailyToday | null> {
  const c = getSupabase();
  if (!c) return null;
  const { data, error } = await c.functions.invoke('daily-set', { body: {} });
  if (error || !data || (data as { ok?: boolean }).ok !== true) return null;
  return fetchDailyToday();
}
