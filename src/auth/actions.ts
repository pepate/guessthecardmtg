import { getSupabase } from '../supabase/client';

export type ActionResult = { ok: true } | { ok: false; error: string };

const redirectTo = () =>
  (typeof window !== 'undefined' ? window.location.origin : '') + import.meta.env.BASE_URL;

function done(error: { message: string } | null): ActionResult {
  return error ? { ok: false, error: error.message } : { ok: true };
}
function offline(): ActionResult {
  return { ok: false, error: 'offline' };
}

export async function secureWithEmailPassword(email: string, password: string): Promise<ActionResult> {
  const c = getSupabase();
  if (!c) return offline();
  return done((await c.auth.updateUser({ email, password })).error);
}

export async function linkGoogle(): Promise<ActionResult> {
  const c = getSupabase();
  if (!c) return offline();
  return done((await c.auth.linkIdentity({ provider: 'google', options: { redirectTo: redirectTo() } })).error);
}

export async function signInWithPassword(email: string, password: string): Promise<ActionResult> {
  const c = getSupabase();
  if (!c) return offline();
  return done((await c.auth.signInWithPassword({ email, password })).error);
}

export async function signInWithGoogle(): Promise<ActionResult> {
  const c = getSupabase();
  if (!c) return offline();
  return done((await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo() } })).error);
}

export async function sendPasswordReset(email: string): Promise<ActionResult> {
  const c = getSupabase();
  if (!c) return offline();
  return done((await c.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() })).error);
}

export async function updatePassword(password: string): Promise<ActionResult> {
  const c = getSupabase();
  if (!c) return offline();
  return done((await c.auth.updateUser({ password })).error);
}

export async function signOut(): Promise<ActionResult> {
  const c = getSupabase();
  if (!c) return offline();
  return done((await c.auth.signOut()).error);
}
