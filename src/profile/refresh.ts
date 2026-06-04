// A tiny notifier so name-dependent UI (the top-right account chip) refetches the
// profile right after a display name is claimed or changed. Claiming a name does
// NOT change the auth status (an anonymous user stays anonymous), so a
// status-keyed effect alone never refreshes — components subscribe here instead.

let version = 0;
const listeners = new Set<() => void>();

/** Signal that the current player's profile (e.g. display name) has changed. */
export function bumpProfile(): void {
  version++;
  for (const l of listeners) l();
}

export function subscribeProfile(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getProfileVersion(): number {
  return version;
}
