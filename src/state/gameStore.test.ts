import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('../cards/client', () => ({ fetchCandidates: vi.fn() }));
vi.mock('../reveal/client', () => ({ fetchEnabledRevealModes: vi.fn() }));
// The legacy popular/all path resolves builtin modes from Supabase; mock it so
// these tests stay offline and deterministic (no real network call).
vi.mock('../modes/client', () => ({
  getBuiltinModes: vi.fn().mockResolvedValue({
    all: { id: 'all-id', name: 'All', filter: {}, card_count: 999 },
    popular: { id: 'pop-id', name: 'Popular', filter: { popular: true }, card_count: 999 },
  }),
}));

import { fetchCandidates } from '../cards/client';
import { fetchEnabledRevealModes } from '../reveal/client';
import { useGameStore } from './gameStore';
import type { ScryfallCard } from '../scryfall/types';

const POPULAR = { kind: 'popular', excludeUniverseBeyond: false } as const;

function card(name: string, withArt = true): ScryfallCard {
  return {
    id: name,
    name,
    cmc: 2,
    type_line: 'Creature',
    rarity: 'common',
    image_uris: withArt ? { normal: `${name}.jpg`, art_crop: `${name}-art.jpg` } : { normal: `${name}.jpg` },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useGameStore.getState().reset();
});

describe('selectPool reveal modes', () => {
  it('stores the fetched enabled modes and resolves a gameMode', async () => {
    (fetchCandidates as Mock).mockResolvedValue(['a', 'b', 'c', 'd', 'e'].map((n) => card(n)));
    (fetchEnabledRevealModes as Mock).mockResolvedValue(['blur', 'scanner', 'mosaic', 'zoom']);

    await useGameStore.getState().selectPool(POPULAR);

    const s = useGameStore.getState();
    expect(s.enabledModes).toEqual(['blur', 'scanner', 'mosaic', 'zoom']);
    expect(['blur', 'scanner', 'mosaic', 'zoom']).toContain(s.gameMode);
    expect(s.phase).toBe('playing');
  });

  it('filters the pool to art-crop cards when gameMode is zoom', async () => {
    (fetchCandidates as Mock).mockResolvedValue([
      card('a'), card('b'), card('c'), card('d'),
      card('noart1', false), card('noart2', false),
    ]);
    (fetchEnabledRevealModes as Mock).mockResolvedValue(['blur', 'scanner', 'mosaic', 'zoom']);
    useGameStore.getState().setRevealChoice('zoom');

    await useGameStore.getState().selectPool(POPULAR);

    const pool = useGameStore.getState().pool;
    expect(pool.map((c) => c.name)).toEqual(['a', 'b', 'c', 'd']);
    expect(pool.every((c) => !!c.image_uris?.art_crop)).toBe(true);
  });

  it('keeps art-crop-less cards when zoom is NOT the gameMode', async () => {
    (fetchCandidates as Mock).mockResolvedValue([
      card('a'), card('b'), card('c'), card('noart', false),
    ]);
    (fetchEnabledRevealModes as Mock).mockResolvedValue(['blur', 'scanner']);

    await useGameStore.getState().selectPool(POPULAR);

    expect(useGameStore.getState().pool.map((c) => c.name)).toContain('noart');
  });

  it('resolves a concrete pendingRevealChoice into gameMode', async () => {
    (fetchCandidates as Mock).mockResolvedValue(['a', 'b', 'c', 'd'].map((n) => card(n)));
    (fetchEnabledRevealModes as Mock).mockResolvedValue(['blur', 'scanner', 'mosaic', 'silhouette']);
    useGameStore.getState().setRevealChoice('silhouette');

    await useGameStore.getState().selectPool(POPULAR);

    expect(useGameStore.getState().gameMode).toBe('silhouette');
  });

  it('resolves "random" to one of the enabled modes', async () => {
    (fetchCandidates as Mock).mockResolvedValue(['a', 'b', 'c', 'd'].map((n) => card(n)));
    (fetchEnabledRevealModes as Mock).mockResolvedValue(['scanner', 'mosaic']);
    useGameStore.getState().setRevealChoice('random');

    await useGameStore.getState().selectPool(POPULAR);

    expect(['scanner', 'mosaic']).toContain(useGameStore.getState().gameMode);
  });
});

describe('reset', () => {
  it('restores the built-in fallback modes and default gameMode', async () => {
    (fetchCandidates as Mock).mockResolvedValue(['a', 'b', 'c', 'd'].map((n) => card(n)));
    (fetchEnabledRevealModes as Mock).mockResolvedValue(['zoom', 'silhouette', 'spotlight']);
    await useGameStore.getState().selectPool(POPULAR);

    useGameStore.getState().reset();

    const s = useGameStore.getState();
    expect(s.enabledModes).toEqual(['blur', 'scanner', 'mosaic']);
    expect(s.gameMode).toBe('blur');
    expect(s.pendingRevealChoice).toBe('random');
    expect(s.phase).toBe('idle');
  });
});
