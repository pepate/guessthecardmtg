import { useCallback, useEffect, useState } from 'react';
import type { PoolKind } from '../state/highscores';
import type { GlobalEntry } from './types';
import { fetchTopScores } from './client';
import { windowCutoff, type TimeWindow } from './window';

export function useLeaderboard(pool: PoolKind, limit: number, window: TimeWindow = 'all') {
  const [entries, setEntries] = useState<GlobalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const reload = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchTopScores(pool, limit, windowCutoff(window))
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pool, limit, window]);

  useEffect(() => reload(), [reload]);

  return { entries, loading, error, reload };
}
