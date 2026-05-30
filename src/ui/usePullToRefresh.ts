import { useEffect, useRef, useState } from 'react';

const THRESHOLD = 64;
const MAX = 80;

/**
 * Pull-down-to-refresh on a scrollable element. Returns a ref to attach and the
 * current damped pull distance (px) for an indicator. Fires `onRefresh` once on
 * release if pulled past THRESHOLD while the element is scrolled to the top.
 */
export function usePullToRefresh<T extends HTMLElement>(onRefresh: () => void) {
  const ref = useRef<T>(null);
  const [pull, setPull] = useState(0);
  const pullRef = useRef(0);
  const startY = useRef(0);
  const active = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = (v: number) => {
      pullRef.current = v;
      setPull(v);
    };
    const onStart = (e: TouchEvent) => {
      if (el.scrollTop <= 0) {
        startY.current = e.touches[0].clientY;
        active.current = true;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (!active.current) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy > 0 && el.scrollTop <= 0) {
        set(Math.min(dy * 0.5, MAX));
        if (e.cancelable) e.preventDefault();
      } else {
        active.current = false;
        set(0);
      }
    };
    const onEnd = () => {
      if (active.current && pullRef.current >= THRESHOLD) onRefresh();
      active.current = false;
      set(0);
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
    };
  }, [onRefresh]);

  return { ref, pull };
}
