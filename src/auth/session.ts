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

function start() {
  if (started) return;
  started = true;
  const c = getSupabase();
  if (!c) return;
  c.auth
    .getSession()
    .then(({ data }) => sync(data.session?.user ?? null))
    .catch(() => {});
  c.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') recovering = true;
    sync(session?.user ?? null);
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

/** Clear the recovery flag once the set-new-password UI has been shown/handled. */
export function clearRecovery(): void {
  recovering = false;
  emit();
}
