import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const getSupabase = vi.fn<() => unknown>(() => ({ rpc }));
vi.mock('../supabase/client', () => ({
  getSupabase: () => getSupabase(),
}));

import { fetchSetList } from './client';

beforeEach(() => {
  rpc.mockReset();
  getSupabase.mockReset();
  getSupabase.mockReturnValue({ rpc });
});

describe('fetchSetList', () => {
  it('maps a set_list RPC row to camelCase SetListItem', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          code: 'lea',
          name: 'Limited Edition Alpha',
          released_at: '1993-08-05',
          eligible_count: 295,
          mode_id: 'mode-uuid-1',
          champion_name: 'Alice',
          champion_score: 1200,
          entry_count: 42,
          last_activity: '2026-01-15T10:00:00.000Z',
        },
      ],
      error: null,
    });

    const items = await fetchSetList();
    expect(rpc).toHaveBeenCalledWith('set_list');
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      code: 'lea',
      name: 'Limited Edition Alpha',
      releasedAt: '1993-08-05',
      eligibleCount: 295,
      modeId: 'mode-uuid-1',
      championName: 'Alice',
      championScore: 1200,
      entryCount: 42,
      lastActivity: '2026-01-15T10:00:00.000Z',
    });
  });

  it('converts bigint-like entry_count to a JS number', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          code: 'neo',
          name: 'Kamigawa: Neon Dynasty',
          released_at: '2022-02-18',
          eligible_count: 302,
          mode_id: null,
          champion_name: null,
          champion_score: null,
          entry_count: 0,
          last_activity: null,
        },
      ],
      error: null,
    });

    const items = await fetchSetList();
    expect(items[0].entryCount).toBe(0);
    expect(typeof items[0].entryCount).toBe('number');
  });

  it('returns an empty array for an empty RPC response', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const items = await fetchSetList();
    expect(items).toEqual([]);
  });

  it('returns an empty array without calling rpc when supabase is not configured', async () => {
    getSupabase.mockReturnValue(null);
    const items = await fetchSetList();
    expect(items).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('throws on an RPC error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'set_list failed' } });
    await expect(fetchSetList()).rejects.toThrow('set_list failed');
  });
});
