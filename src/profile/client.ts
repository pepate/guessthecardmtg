import { getSupabase } from '../supabase/client';

export interface Profile {
  displayName: string;
  gamesPlayed: number;
  totalCorrect: number;
  totalCards: number;
}

export async function getProfile(uid: string): Promise<Profile | null> {
  const c = getSupabase();
  if (!c) return null;
  const { data, error } = await c
    .from('profiles')
    .select('display_name,games_played,total_correct,total_cards')
    .eq('user_id', uid)
    .maybeSingle();
  if (error || !data) return null;
  return {
    displayName: data.display_name,
    gamesPlayed: data.games_played,
    totalCorrect: data.total_correct,
    totalCards: data.total_cards,
  };
}

export async function upsertDisplayName(
  uid: string,
  name: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const c = getSupabase();
  if (!c) return { ok: false, error: 'offline' };
  const { error } = await c
    .from('profiles')
    .upsert({ user_id: uid, display_name: name }, { onConflict: 'user_id' });
  if (!error) return { ok: true };
  // Postgres unique_violation on the case-insensitive display-name index.
  if (error.code === '23505') return { ok: false, error: 'name-taken' };
  return { ok: false, error: error.message };
}

/** True if no other player already uses this display name (case-insensitive).
 *  Runs through a SECURITY DEFINER RPC because RLS hides other users' profiles.
 *  Returns true on any error so a transient failure never blocks the user — the
 *  server-side unique constraint is the real guarantee. */
export async function checkNameAvailable(name: string): Promise<boolean> {
  const c = getSupabase();
  if (!c) return true;
  const { data, error } = await c.rpc('name_available', { p_name: name });
  if (error) return true;
  return data !== false;
}
