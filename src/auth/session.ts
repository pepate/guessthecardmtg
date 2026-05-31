import type { User } from '@supabase/supabase-js';
import { getSupabase } from '../supabase/client';
import { setCachedUserId } from '../leaderboard/identity';

type Listener = () => void;
const listeners = new Set<Listener>();
let currentUser: User | null = null;
let recovering = false;
let authError: string | null = null;
let started = false;

function emit() {
  for (const l of listeners) l();
}

// OAuth (Google) returns land back on the app URL. On failure the provider/Supabase
// append error params (hash for the implicit flow, sometimes the query). Read them
// once, turn them into a friendly message, and strip them so a reload is clean.
function readOAuthError(): string | null {
  if (typeof window === 'undefined') return null;
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const search = new URLSearchParams(window.location.search);
  const err = hash.get('error') || search.get('error');
  if (!err) return null;

  const code = hash.get('error_code') || search.get('error_code') || '';
  const desc = (hash.get('error_description') || search.get('error_description') || '').replace(/\+/g, ' ');

  const url = new URL(window.location.href);
  ['error', 'error_code', 'error_description'].forEach((k) => url.searchParams.delete(k));
  url.hash = '';
  window.history.replaceState({}, '', url.pathname + url.search);

  if (/already|another|linked|exists/i.test(`${desc} ${code}`)) {
    return 'That Google account already belongs to another account. Use “Sign in to another account” below to log in with it instead.';
  }
  return desc ? `Google sign-in failed: ${desc}` : 'Google sign-in failed — please try again.';
}

// Read at module load (before the first render reads the snapshot) so a failed
// OAuth return is shown without needing a re-emit. Only touches the URL on error.
authError = readOAuthError();

function sync(user: User | null) {
  currentUser = user;
  setCachedUserId(user?.id ?? null);
  emit();
}

// Apply a session: set the user from the JWT immediately, then refresh from the
// server so is_anonymous / linked identities are authoritative (the JWT can lag
// just after linking an account).
async function applySession(c: NonNullable<ReturnType<typeof getSupabase>>, user: User | null) {
  sync(user);
  if (!user) return;
  try {
    const { data } = await c.auth.getUser();
    if (data?.user) sync(data.user);
  } catch {
    // keep the JWT-derived user
  }
}

function start() {
  if (started) return;
  started = true;
  const c = getSupabase();
  if (!c) return;
  c.auth
    .getSession()
    .then(({ data }) => applySession(c, data.session?.user ?? null))
    .catch(() => {});
  c.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') recovering = true;
    void applySession(c, session?.user ?? null);
  });
}

/** Subscribe to auth-state changes. Returns an unsubscribe fn. Lazily starts the listener. */
export function subscribe(cb: Listener): () => void {
  start();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getUserSnapshot(): User | null {
  return currentUser;
}

export function getRecoverySnapshot(): boolean {
  return recovering;
}

export function getAuthErrorSnapshot(): string | null {
  return authError;
}

/** Clear the surfaced OAuth error once it's been shown/handled. */
export function clearAuthError(): void {
  authError = null;
  emit();
}

/** Re-fetch the user from the server and broadcast it. Lets the UI pick up an
 *  out-of-band email confirmation (clicked on another tab/device) without a
 *  local session change. */
export async function refreshUser(): Promise<void> {
  const c = getSupabase();
  if (!c) return;
  try {
    const { data } = await c.auth.getUser();
    sync(data?.user ?? null);
  } catch {
    // network blip — keep current user
  }
}

/** Clear the recovery flag once the set-new-password UI has been shown/handled. */
export function clearRecovery(): void {
  recovering = false;
  emit();
}
