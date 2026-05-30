import { useCallback, useEffect, useState } from 'react';
import type { GlobalEntry } from './types';
import { fetchModeTopScores } from './client';
import { windowCutoff, type TimeWindow } from './window';

export function useLeaderboard(
  modeId: string,
  limit: number,
  window: TimeWindow = 'all',
  refreshKey = 0,
) {
  const [entries, setEntries] = useState<GlobalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const reload = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchModeTopScores(modeId, limit, windowCutoff(window))
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
  }, [modeId, limit, window, refreshKey]);

  useEffect(() => reload(), [reload]);

  return { entries, loading, error, reload };
}
