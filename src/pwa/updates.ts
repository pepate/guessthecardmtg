import { registerSW } from 'virtual:pwa-register';

// Service-worker update coordination.
//
// The PWA precaches the app shell, so without help an installed/open client can
// sit on a stale build indefinitely. This module:
//   1. registers the SW and re-checks for a new version periodically and on focus
//      (an open PWA otherwise only checks on a fresh navigation), and
//   2. exposes a "ready → apply" handshake so the app can reload into the new
//      version at a SAFE moment (not mid-game). See the consumer in App.tsx.

// How often to ask the browser to re-check for a new service worker.
const UPDATE_INTERVAL_MS = 60_000;

type Listener = () => void;
const listeners = new Set<Listener>();
let ready = false;
let applyFn: (() => void) | null = null;

export function initPwaUpdates(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  const updateSW = registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      const check = () => void registration.update().catch(() => {});
      setInterval(check, UPDATE_INTERVAL_MS);
      // A standalone PWA brought back to the foreground should re-check at once.
      window.addEventListener('focus', check);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
    onNeedRefresh() {
      ready = true;
      applyFn = () => void updateSW(true); // skipWaiting + reload
      listeners.forEach((l) => l());
    },
  });
}

/** True once a new version has been installed and is waiting to be applied. */
export function isUpdateReady(): boolean {
  return ready;
}

/** Subscribe to "an update is ready". Returns an unsubscribe fn. */
export function onUpdateReady(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Reload into the new version. No-op until an update is actually ready. */
export function applyUpdate(): void {
  applyFn?.();
}
