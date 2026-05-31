import { describe, it, expect, vi, beforeEach } from 'vitest';

const from = vi.fn();
const listModes = vi.fn();
const fetchModeStandings = vi.fn();

vi.mock('../supabase/client', () => ({ getSupabase: () => ({ from }) }));
vi.mock('../modes/client', () => ({ listModes }));
vi.mock('../leaderboard/client', () => ({ fetchModeStandings }));

function query(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq']) q[m] = vi.fn(() => q);
  (q as { then: unknown }).then = (f: (v: unknown) => unknown) => Promise.resolve(result).then(f);
  return q;
}

async function importStats() {
  vi.resetModules();
  return import('./stats');
}

beforeEach(() => {
  from.mockReset();
  listModes.mockReset();
  fetchModeStandings.mockReset();
});

describe('fetchPlayerBests', () => {
  it('keeps the best score per mode, names them, attaches ranks, sorts desc', async () => {
    from.mockReturnValueOnce(
      query({
        data: [
          { mode_id: 'm1', score: 500, game_mode: 'blur' },
          { mode_id: 'm1', score: 900, game_mode: 'zoom' }, // best for m1
          { mode_id: 'm2', score: 700, game_mode: 'mosaic' },
        ],
        error: null,
      }),
    );
    listModes.mockResolvedValue([
      { id: 'm1', name: 'Simic' },
      { id: 'm2', name: 'Top 100' },
    ]);
    fetchModeStandings.mockResolvedValue(new Map([['m1', 1], ['m2', 4]]));

    const { fetchPlayerBests } = await importStats();
    const bests = await fetchPlayerBests('uid');

    expect(bests).toEqual([
      { modeId: 'm1', modeName: 'Simic', bestScore: 900, reveal: 'zoom', rank: 1 },
      { modeId: 'm2', modeName: 'Top 100', bestScore: 700, reveal: 'mosaic', rank: 4 },
    ]);
    expect(fetchModeStandings).toHaveBeenCalledWith(['m1', 'm2'], 'uid');
  });

  it('returns [] when the player has no rows', async () => {
    from.mockReturnValueOnce(query({ data: [], error: null }));
    const { fetchPlayerBests } = await importStats();
    expect(await fetchPlayerBests('uid')).toEqual([]);
    expect(listModes).not.toHaveBeenCalled();
  });

  it('falls back to a placeholder name and null rank when missing', async () => {
    from.mockReturnValueOnce(query({ data: [{ mode_id: 'm9', score: 300, game_mode: null }], error: null }));
    listModes.mockResolvedValue([]);
    fetchModeStandings.mockResolvedValue(new Map());
    const { fetchPlayerBests } = await importStats();
    const bests = await fetchPlayerBests('uid');
    expect(bests).toEqual([{ modeId: 'm9', modeName: 'Unknown mode', bestScore: 300, reveal: null, rank: null }]);
  });
});
