import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recentDistinctIds, fillToLimit } from './recent';
import type { CustomMode } from './types';

const mode = (id: string): CustomMode => ({ id, name: id, filter: {}, card_count: 10 });

describe('recentDistinctIds', () => {
  it('keeps the first occurrence of each mode_id, newest first, capped at limit', () => {
    const rows = [
      { mode_id: 'a' }, { mode_id: 'b' }, { mode_id: 'a' }, { mode_id: 'c' }, { mode_id: 'd' }, { mode_id: 'e' },
    ];
    expect(recentDistinctIds(rows, 4)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('returns fewer than limit when there are fewer distinct ids', () => {
    expect(recentDistinctIds([{ mode_id: 'a' }, { mode_id: 'a' }], 4)).toEqual(['a']);
  });
});

describe('fillToLimit', () => {
  it('appends extras not already present, up to the limit', () => {
    const out = fillToLimit([mode('a'), mode('b')], [mode('b'), mode('c'), mode('d'), mode('e')], 4);
    expect(out.map((m) => m.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('never exceeds the limit even if primary already has enough', () => {
    const out = fillToLimit([mode('a'), mode('b'), mode('c'), mode('d')], [mode('e')], 4);
    expect(out.map((m) => m.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

const from = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from })),
}));
vi.mock('../leaderboard/identity', () => ({
  getUserId: vi.fn().mockResolvedValue('dev-1'),
}));
vi.mock('./client', () => ({
  getModeById: vi.fn((id: string) => Promise.resolve({ id, name: `Mode ${id}`, filter: {}, card_count: 5 })),
}));

function query(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit']) q[m] = vi.fn(() => q);
  (q as { then: unknown }).then = (f: (v: unknown) => unknown) => Promise.resolve(result).then(f);
  return q;
}

async function importRecent() {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  vi.resetModules();
  return import('./recent');
}

describe('fetchRecentGames', () => {
  beforeEach(() => { from.mockReset(); vi.unstubAllEnvs(); });

  it('resolves the device\'s distinct recent modes, newest first', async () => {
    from.mockReturnValueOnce(query({
      data: [
        { mode_id: 'm1', created_at: '2026-01-03T00:00:00Z' },
        { mode_id: 'm2', created_at: '2026-01-02T00:00:00Z' },
        { mode_id: 'm1', created_at: '2026-01-01T00:00:00Z' },
      ],
      error: null,
    }));
    const { fetchRecentGames } = await importRecent();
    const games = await fetchRecentGames(4);
    expect(games.map((m) => m.id)).toEqual(['m1', 'm2']);
  });
});
