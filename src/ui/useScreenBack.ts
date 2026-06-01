import { useEffect, useRef } from 'react';

/**
 * Maps the device/browser Back button (and swipe-back) to an in-app "go to the
 * previous screen" action. While `active` (i.e. a non-root screen is showing),
 * one sentinel history entry is held so Back pops back into the app instead of
 * leaving it; `onBack` is then invoked to navigate. When the screen is left via
 * the UI instead of Back, the sentinel entry is removed so no stale entry lingers.
 */
export function useScreenBack(active: boolean, onBack: () => void) {
  const cb = useRef(onBack);
  cb.current = onBack;

  useEffect(() => {
    if (!active) return;
    let poppedByBack = false;
    window.history.pushState({ __screen: true }, '');
    const onPop = () => {
      poppedByBack = true;
      cb.current();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // Left via the UI (not Back): drop our sentinel so the history stays clean.
      if (!poppedByBack) window.history.back();
    };
  }, [active]);
}
