import { getSupabase } from '../supabase/client';

let cachedUserId: string | null = null;

/** The current player's auth id, or null if not signed in. Does not create a session. */
export async function getUserId(): Promise<string | null> {
  if (cachedUserId) return cachedUserId;
  const c = getSupabase();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  cachedUserId = data.session?.user?.id ?? null;
  return cachedUserId;
}

/** The current player's auth id, signing in anonymously if there is no session yet. */
export async function ensureUserId(): Promise<string | null> {
  const existing = await getUserId();
  if (existing) return existing;
  const c = getSupabase();
  if (!c) return null;
  const { data, error } = await c.auth.signInAnonymously();
  if (error || !data.user) return null;
  cachedUserId = data.user.id;
  return cachedUserId;
}
