import { describe, it, expect } from 'vitest';
import { windowCutoff, WINDOW_TABS } from './window';

const NOW = 1_000_000_000_000;
const DAY = 86_400_000;

describe('windowCutoff', () => {
  it('today = now minus 24h', () => {
    expect(windowCutoff('today', NOW)).toBe(NOW - DAY);
  });
  it('week = now minus 7 days', () => {
    expect(windowCutoff('week', NOW)).toBe(NOW - 7 * DAY);
  });
  it('all = null (no time filter)', () => {
    expect(windowCutoff('all', NOW)).toBeNull();
  });
});

describe('WINDOW_TABS', () => {
  it('lists today, week, all in order', () => {
    expect(WINDOW_TABS.map((t) => t.key)).toEqual(['today', 'week', 'all']);
  });
});
