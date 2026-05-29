import { useEffect, useState } from 'react';
import { useGameStore } from './gameStore';

/**
 * Drives the round timer. Returns elapsed ms since the round started and calls
 * store.expire() once the duration is reached. Uses requestAnimationFrame so it
 * stays smooth and is controllable by Playwright's page.clock in e2e.
 */
export function useGameClock(): number {
  const round = useGameStore((s) => s.round);
  const durationMs = useGameStore((s) => s.config.durationMs);
  const expire = useGameStore((s) => s.expire);
  const [elapsedMs, setElapsedMs] = useState(0);

  const startedAt = round?.startedAt;
  const playing = round?.status === 'playing';

  useEffect(() => {
    if (startedAt == null || !playing) return;
    let raf = 0;
    const tick = () => {
      const e = Date.now() - startedAt;
      if (e >= durationMs) {
        setElapsedMs(durationMs);
        expire();
        return;
      }
      setElapsedMs(e);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [startedAt, playing, durationMs, expire]);

  return elapsedMs;
}
