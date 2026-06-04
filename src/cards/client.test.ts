import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const from = vi.fn();
vi.mock('../supabase/client', () => ({
  getSupabase: () => ({ rpc, from }),
}));

import { rowToCard, fetchCandidates, fetchRandomCard, fetchModeTopArt, fetchSetTopArts, type GameCardRow } from './client';

/** A chainable query stub that resolves (when awaited) to `result`. */
function query(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit']) q[m] = vi.fn(() => q);
  (q as { then: unknown }).then = (f: (v: unknown) => unknown) => Promise.resolve(result).then(f);
  return q;
}

function row(overrides: Partial<GameCardRow> = {}): GameCardRow {
  return {
    oracle_id: 'o1',
    name: 'Lightning Bolt',
    cmc: 1,
    colors: ['R'],
    color_identity: ['R'],
    type_line: 'Instant',
    power: null,
    toughness: null,
    rarity: 'common',
    set_code: 'm10',
    set_name: 'Magic 2010',
    image_normal: 'n.jpg',
    image_art_crop: 'a.jpg',
    ...overrides,
  };
}

beforeEach(() => { rpc.mockReset(); from.mockReset(); });

describe('rowToCard', () => {
  it('maps an RPC row onto the ScryfallCard shape', () => {
    expect(rowToCard(row())).toEqual({
      id: 'o1',
      name: 'Lightning Bolt',
      cmc: 1,
      colors: ['R'],
      color_identity: ['R'],
      type_line: 'Instant',
      power: undefined,
      toughness: undefined,
      rarity: 'common',
      set: 'm10',
      set_name: 'Magic 2010',
      image_uris: { normal: 'n.jpg', art_crop: 'a.jpg' },
    });
  });
});

describe('fetchCandidates', () => {
  it('calls get_filtered_game_cards with the filter and maps rows', async () => {
    rpc.mockResolvedValue({ data: [row(), row({ oracle_id: 'o2', name: 'Counterspell' })], error: null });
    const cards = await fetchCandidates({ popular: true });
    expect(rpc).toHaveBeenCalledWith('get_filtered_game_cards', {
      p_filter: { popular: true },
      p_count: 175,
    });
    expect(cards.map((c) => c.name)).toEqual(['Lightning Bolt', 'Counterspell']);
  });

  it('forwards a custom limit as p_count', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await fetchCandidates({}, 40);
    expect(rpc).toHaveBeenCalledWith('get_filtered_game_cards', {
      p_filter: {},
      p_count: 40,
    });
  });

  it('throws on an RPC error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(fetchCandidates({})).rejects.toThrow('boom');
  });
});

describe('fetchRandomCard', () => {
  it('returns the single card from a count-1 empty-filter query', async () => {
    rpc.mockResolvedValue({ data: [row()], error: null });
    const card = await fetchRandomCard();
    expect(rpc).toHaveBeenCalledWith('get_filtered_game_cards', {
      p_filter: {},
      p_count: 1,
    });
    expect(card.image_uris?.art_crop).toBe('a.jpg');
  });

  it('throws when no card comes back', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await expect(fetchRandomCard()).rejects.toThrow();
  });
});

describe('fetchModeTopArt', () => {
  it('returns the art url from mode_top_card_art', async () => {
    rpc.mockResolvedValue({ data: 'https://cards/art.jpg', error: null });
    expect(await fetchModeTopArt({ edhrec: { max: 100 } })).toBe('https://cards/art.jpg');
    expect(rpc).toHaveBeenCalledWith('mode_top_card_art', { p_filter: { edhrec: { max: 100 } } });
  });

  it('returns null on error or non-string data', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await fetchModeTopArt({})).toBeNull();
  });
});

describe('fetchSetTopArts', () => {
  it('returns one art per top-EDHRec card in the set', async () => {
    from.mockReturnValueOnce(query({
      data: [
        { edhrec_rank: 1, card_art: [{ image_art_crop: 'a1.jpg', set_code: 'fin' }] },
        { edhrec_rank: 2, card_art: [{ image_art_crop: 'a2.jpg', set_code: 'fin' }] },
        { edhrec_rank: 5, card_art: [{ image_art_crop: 'a3.jpg', set_code: 'fin' }] },
      ],
      error: null,
    }));
    expect(await fetchSetTopArts('fin', 4)).toEqual(['a1.jpg', 'a2.jpg', 'a3.jpg']);
  });

  it('returns [] for a blank set code without querying', async () => {
    expect(await fetchSetTopArts('', 4)).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it('returns [] on a query error', async () => {
    from.mockReturnValueOnce(query({ data: null, error: { message: 'boom' } }));
    expect(await fetchSetTopArts('fin', 4)).toEqual([]);
  });
});
