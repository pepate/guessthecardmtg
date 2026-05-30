export type TimeWindow = 'today' | 'week' | 'all';

const DAY_MS = 86_400_000;

/** Epoch-ms cutoff for a window, or null for all-time. Rolling from `now`. */
export function windowCutoff(window: TimeWindow, now: number = Date.now()): number | null {
  if (window === 'today') return now - DAY_MS;
  if (window === 'week') return now - 7 * DAY_MS;
  return null;
}

export const WINDOW_TABS: { key: TimeWindow; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Weekly' },
  { key: 'all', label: 'All-time' },
];
