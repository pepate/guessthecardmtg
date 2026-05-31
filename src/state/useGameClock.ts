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

/**
 * Drives the overall game timer (config.gameDurationMs). Returns the remaining ms and calls
 * store.endGame() once the game duration elapses. Like useGameClock it uses
 * requestAnimationFrame so Playwright's page.clock can drive it in e2e.
 */
export function useGameTimeLeft(): number {
  const phase = useGameStore((s) => s.phase);
  const gameStartedAt = useGameStore((s) => s.gameStartedAt);
  const gameDurationMs = useGameStore((s) => s.config.gameDurationMs);
  const endGame = useGameStore((s) => s.endGame);
  const [remainingMs, setRemainingMs] = useState(gameDurationMs);

  const running = phase === 'playing' && gameStartedAt > 0;

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const tick = () => {
      const left = gameStartedAt + gameDurationMs - Date.now();
      if (left <= 0) {
        setRemainingMs(0);
        endGame();
        return;
      }
      setRemainingMs(left);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, gameStartedAt, gameDurationMs, endGame]);

  return remainingMs;
}
