import type { User } from '@supabase/supabase-js';
import { getSupabase } from '../supabase/client';
import { setCachedUserId } from '../leaderboard/identity';

type Listener = () => void;
const listeners = new Set<Listener>();
let currentUser: User | null = null;
let recovering = false;
let started = false;

function emit() {
  for (const l of listeners) l();
}

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
