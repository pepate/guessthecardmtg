import { describe, it, expect } from 'vitest';
import {
  isEligiblePrinting,
  toCardFields,
  toArtFields,
  topPopularOracleIds,
  type RawCard,
} from './seedFilter';

function base(overrides: Partial<RawCard> = {}): RawCard {
  return {
    oracle_id: 'o1',
    name: 'Lightning Bolt',
    lang: 'en',
    games: ['paper', 'mtgo'],
    layout: 'normal',
    digital: false,
    border_color: 'black',
    full_art: false,
    textless: false,
    frame: '2015',
    frame_effects: [],
    set_type: 'core',
    type_line: 'Instant',
    cmc: 1,
    colors: ['R'],
    color_identity: ['R'],
    power: undefined,
    toughness: undefined,
    rarity: 'common',
    set: 'm10',
    set_name: 'Magic 2010',
    edhrec_rank: 42,
    image_uris: { normal: 'n.jpg', art_crop: 'a.jpg' },
    ...overrides,
  };
}

describe('isEligiblePrinting', () => {
  it('keeps a clean modern English paper printing', () => {
    expect(isEligiblePrinting(base())).toBe(true);
  });
  it('keeps retro frame 2003', () => {
    expect(isEligiblePrinting(base({ frame: '2003' }))).toBe(true);
  });
  it('rejects non-English', () => {
    expect(isEligiblePrinting(base({ lang: 'de' }))).toBe(false);
  });
  it('rejects non-paper', () => {
    expect(isEligiblePrinting(base({ games: ['mtgo', 'arena'] }))).toBe(false);
  });
  it('rejects non-normal layout', () => {
    expect(isEligiblePrinting(base({ layout: 'transform' }))).toBe(false);
  });
  it('rejects digital', () => {
    expect(isEligiblePrinting(base({ digital: true }))).toBe(false);
  });
  it('rejects non-black border', () => {
    expect(isEligiblePrinting(base({ border_color: 'borderless' }))).toBe(false);
  });
  it('rejects full art', () => {
    expect(isEligiblePrinting(base({ full_art: true }))).toBe(false);
  });
  it('rejects textless', () => {
    expect(isEligiblePrinting(base({ textless: true }))).toBe(false);
  });
  it('rejects old frames', () => {
    expect(isEligiblePrinting(base({ frame: '1997' }))).toBe(false);
  });
  it('rejects showcase / extendedart frame effects', () => {
    expect(isEligiblePrinting(base({ frame_effects: ['showcase'] }))).toBe(false);
    expect(isEligiblePrinting(base({ frame_effects: ['extendedart'] }))).toBe(false);
  });
  it('rejects funny and memorabilia sets', () => {
    expect(isEligiblePrinting(base({ set_type: 'funny' }))).toBe(false);
    expect(isEligiblePrinting(base({ set_type: 'memorabilia' }))).toBe(false);
  });
  it('rejects basic lands', () => {
    expect(isEligiblePrinting(base({ type_line: 'Basic Land — Forest' }))).toBe(false);
  });
  it('rejects printings missing an image', () => {
    expect(isEligiblePrinting(base({ image_uris: { art_crop: 'a.jpg' } }))).toBe(false);
    expect(isEligiblePrinting(base({ image_uris: { normal: 'n.jpg' } }))).toBe(false);
  });
});

describe('toCardFields / toArtFields', () => {
  it('extracts oracle-level card fields', () => {
    expect(toCardFields(base())).toEqual({
      oracle_id: 'o1',
      name: 'Lightning Bolt',
      cmc: 1,
      colors: ['R'],
      color_identity: ['R'],
      type_line: 'Instant',
      power: null,
      toughness: null,
      edhrec_rank: 42,
      is_popular: false,
      is_ub: false,
    });
  });
  it('extracts printing-level art fields', () => {
    expect(toArtFields(base())).toEqual({
      oracle_id: 'o1',
      set_code: 'm10',
      set_name: 'Magic 2010',
      rarity: 'common',
      image_normal: 'n.jpg',
      image_art_crop: 'a.jpg',
    });
  });
});

describe('topPopularOracleIds', () => {
  it('returns the n lowest-rank oracle ids, ignoring null ranks', () => {
    const cards = [
      { oracle_id: 'a', edhrec_rank: 100 },
      { oracle_id: 'b', edhrec_rank: 1 },
      { oracle_id: 'c', edhrec_rank: null },
      { oracle_id: 'd', edhrec_rank: 50 },
    ];
    expect(topPopularOracleIds(cards, 2)).toEqual(new Set(['b', 'd']));
  });
});
