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
  return error ? { ok: false, error: error.message } : { ok: true };
}
