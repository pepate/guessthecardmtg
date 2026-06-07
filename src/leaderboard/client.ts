import { getSupabase } from '../supabase/client';
import { ensureUserId } from './identity';
import type { GlobalEntry, SubmitPayload } from './types';
import type { RevealMode } from '../engine/revealMode';
import { aggregateByPerson, type LeaderboardRun } from './aggregate';
import {
  comboBoard,
  deviceModeStanding,
  type Run,
} from './boards';

// Upper bound on raw rows pulled per board. The board is collapsed to one row per
// person client-side, so we fetch enough runs to cover every reveal mode of the top
// players rather than a small per-row limit.
const ROW_FETCH_CAP = 500;

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
  device_id: string;
  country: string | null;
  created_at: string;
}

function toRun(r: Row): LeaderboardRun {
  return {
    id: r.id,
    name: r.name,
    score: r.score,
    correct: r.correct,
    gameMode: (r.game_mode as RevealMode | null) ?? null,
    deviceId: r.device_id,
    country: r.country,
    createdAt: new Date(r.created_at).getTime(),
  };
}

/** All runs for a mode, collapsed to one entry per person and ranked by best score. */
async function fetchPersons(modeId: string, since: number | null): Promise<GlobalEntry[]> {
  const c = getSupabase();
  if (!c) return [];
  let q = c
    .from('leaderboard_top')
    .select('id,name,score,correct,mode_id,game_mode,device_id,country,created_at')
    .eq('mode_id', modeId);
  if (since != null) q = q.gte('created_at', new Date(since).toISOString());
  const { data, error } = await q
    .order('score', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(ROW_FETCH_CAP);
  if (error) throw new Error(error.message);
  return aggregateByPerson(((data ?? []) as Row[]).map(toRun));
}

export async function fetchModeTopScores(
  modeId: string,
  limit = 5,
  since: number | null = null,
): Promise<GlobalEntry[]> {
  const persons = await fetchPersons(modeId, since);
  return persons.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Per-(mode,reveal) board fetchers
// ---------------------------------------------------------------------------

function rowToRun(r: Row): Run {
  return {
    id: r.id,
    name: r.name,
    score: r.score,
    correct: r.correct,
    gameMode: (r.game_mode as RevealMode | null) ?? null,
    deviceId: r.device_id,
    country: r.country,
    createdAt: new Date(r.created_at).getTime(),
  };
}

/** All runs for a mode (optionally since a cutoff epoch ms). */
export async function fetchModeRuns(
  modeId: string,
  since?: number | null,
): Promise<Run[]> {
  const c = getSupabase();
  if (!c) return [];
  let q = c
    .from('leaderboard_top')
    .select('id,name,score,correct,mode_id,game_mode,device_id,country,created_at')
    .eq('mode_id', modeId);
  if (since != null) q = q.gte('created_at', new Date(since).toISOString());
  const { data, error } = await q
    .order('score', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(ROW_FETCH_CAP);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(rowToRun);
}

/** One (mode,reveal) board, top `limit`, within an optional time window. */
export async function fetchComboBoard(
  modeId: string,
  reveal: RevealMode,
  since?: number | null,
  limit = 5,
): Promise<GlobalEntry[]> {
  return comboBoard(await fetchModeRuns(modeId, since), reveal).slice(0, limit);
}

/** For each given mode id, the device's best rank across reveals (or null). All-time. */
export async function fetchModeStandings(
  modeIds: string[],
  deviceId: string,
): Promise<Map<string, number | null>> {
  const runArrays = await Promise.all(modeIds.map((id) => fetchModeRuns(id, null)));
  const result = new Map<string, number | null>();
  for (let i = 0; i < modeIds.length; i++) {
    result.set(modeIds[i], deviceModeStanding(runArrays[i], deviceId));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------

export type SubmitResult =
  | { ok: true; id: string; rank: number }
  | { ok: false; reason: string };

export async function submitScore(payload: SubmitPayload): Promise<SubmitResult> {
  const c = getSupabase();
  if (!c) return { ok: false, reason: 'disabled' };
  // Ensure a session exists so supabase-js attaches the user JWT to the invoke.
  const uid = await ensureUserId();
  if (!uid) return { ok: false, reason: 'auth' };
  const body = {
    name: payload.name,
    score: payload.score,
    correct: payload.correct,
    cards: payload.cards,
    mode_id: payload.modeId,
    game_mode: payload.gameMode,
  };
  const { data, error } = await c.functions.invoke('submit-score', { body });
  if (error) return { ok: false, reason: error.message };
  if (!data || data.ok !== true) return { ok: false, reason: data?.reason ?? 'rejected' };
  return { ok: true, id: data.id, rank: data.rank };
}
