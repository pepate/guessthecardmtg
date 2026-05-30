import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('../supabase/client', () => ({
  getSupabase: () => ({ rpc }),
}));

import { rowToCard, fetchCandidates, fetchRandomCard, type GameCardRow } from './client';

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

beforeEach(() => rpc.mockReset());

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
