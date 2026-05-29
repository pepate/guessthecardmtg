import { useEffect, useRef, useState } from 'react';

/**
 * Tween a displayed number toward `value`. When `resetKey` changes the count
 * restarts from `from` (default 0); otherwise it animates from the previous
 * displayed value to the new one. rAF-driven so it stays smooth.
 */
export function useCountUp(value: number, durationMs = 900, resetKey?: number, from = 0): number {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  const lastKey = useRef(resetKey);

  useEffect(() => {
    const start = resetKey !== undefined && resetKey !== lastKey.current ? from : prev.current;
    lastKey.current = resetKey;
    prev.current = value;

    if (start === value) {
      setDisplay(value);
      return;
    }

    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / durationMs);
      // easeOutQuad for a snappy-then-settling count.
      const eased = 1 - (1 - t) * (1 - t);
      setDisplay(Math.round(start + (value - start) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, resetKey, durationMs]);

  return display;
}
