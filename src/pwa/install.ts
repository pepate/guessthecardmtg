import { useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// `beforeinstallprompt` fires once, early on load — long before the gameover
// screen mounts. Capture it at module scope so the install button can offer it
// later instead of missing the event entirely.
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    emit();
  });
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function canInstall(): boolean {
  return deferred !== null;
}

export function useCanInstall(): boolean {
  return useSyncExternalStore(subscribe, canInstall, () => false);
}

export async function promptInstall(): Promise<void> {
  const prompt = deferred;
  if (!prompt) return;
  await prompt.prompt();
  await prompt.userChoice;
  // The browser only honours a prompt once; drop it so the button hides.
  deferred = null;
  emit();
}
