import { describe, expect, it } from 'vitest';
import { canonicalizeFilter, filterHash, modeName, validateFilter, type CustomFilter } from './filter';

describe('validateFilter', () => {
  it('accepts a normal filter', () => {
    expect(validateFilter({ types: ['Creature'], cmc: { min: 1, max: 4 } })).toEqual({ ok: true });
  });
  it('rejects power/toughness unless types is exactly [Creature]', () => {
    expect(validateFilter({ types: ['Creature', 'Instant'], power: { min: 2 } }))
      .toEqual({ ok: false, reason: 'pt-requires-creature' });
    expect(validateFilter({ power: { min: 2 } })).toEqual({ ok: false, reason: 'pt-requires-creature' });
  });
  it('treats a set as a normal filter that combines with others', () => {
    expect(validateFilter({ sets: ['dom'], cmc: { min: 1 } })).toEqual({ ok: true });
    expect(validateFilter({ sets: ['dom'] })).toEqual({ ok: true });
  });
  it('rejects inverted ranges', () => {
    expect(validateFilter({ cmc: { min: 5, max: 2 } })).toEqual({ ok: false, reason: 'bad-range' });
  });
});

describe('modeName', () => {
  it('names mono-color creatures with a cmc range', () => {
    expect(modeName({ colors: { values: ['R'], match: 'any' }, types: ['Creature'], cmc: { min: 1, max: 3 } }))
      .toBe('Mono-Red Creatures · CMC 1–3');
  });
  it('joins multiple types and shows EDH ceiling', () => {
    expect(modeName({ types: ['Instant', 'Sorcery'], edhrec: { max: 500 } }))
      .toBe('Instants & Sorceries · EDH ≤500');
  });
  it('falls back to a generic label for an empty filter', () => {
    expect(modeName({})).toBe('All cards (custom)');
  });
  it('labels UB-only and rarity', () => {
    expect(modeName({ ub: 'only', rarities: ['mythic'] })).toBe('Universe Beyond · Mythic');
  });
});

describe('filterHash', () => {
  it('is identical for equivalent filters regardless of input order', async () => {
    const a = await filterHash({ types: ['Instant', 'Creature'], cmc: { max: 3, min: 1 } });
    const b = await filterHash({ cmc: { min: 1, max: 3 }, types: ['Creature', 'Instant'] });
    expect(a).toBe(b);
  });

  it('differs when a bound differs', async () => {
    const a = await filterHash({ cmc: { min: 1 } });
    const b = await filterHash({ cmc: { min: 2 } });
    expect(a).not.toBe(b);
  });

  it('returns a 64-char hex sha256', async () => {
    expect(await filterHash({ ub: 'only' })).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('canonicalizeFilter', () => {
  it('drops empty/default fields', () => {
    const f: CustomFilter = { cmc: {}, colors: { values: [], match: 'any' }, types: [] };
    expect(canonicalizeFilter(f)).toEqual({});
  });

  it('sorts array members and object keys deterministically', () => {
    const a = canonicalizeFilter({ types: ['Instant', 'Creature'], rarities: ['rare', 'common'] });
    const b = canonicalizeFilter({ rarities: ['common', 'rare'], types: ['Creature', 'Instant'] });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('keeps colorless C and match mode', () => {
    expect(canonicalizeFilter({ colors: { values: ['R', 'C'], match: 'all' } }))
      .toEqual({ colors: { match: 'all', values: ['C', 'R'] } });
  });

  it('keeps only present cmc bounds', () => {
    expect(canonicalizeFilter({ cmc: { min: 2 } })).toEqual({ cmc: { min: 2 } });
  });
});

describe('year filter', () => {
  it('canonicalizes year between edhrec and sets', () => {
    const c = canonicalizeFilter({ year: { min: 1993, max: 1999 }, edhrec: { min: 1 } });
    expect(c.year).toEqual({ min: 1993, max: 1999 });
    expect(JSON.stringify(c)).toContain('"edhrec"');
  });
  it('rejects an inverted year range', () => {
    expect(validateFilter({ year: { min: 2010, max: 2000 } })).toEqual({ ok: false, reason: 'bad-range' });
  });
  it('labels a year range in the mode name', () => {
    expect(modeName({ year: { min: 1993, max: 1999 } })).toContain('1993–1999');
  });
  it('combines a set with a year filter', () => {
    expect(validateFilter({ sets: ['dom'], year: { min: 2018 } })).toEqual({ ok: true });
  });
  it('pins canonical key order (year after edhrec) for stable hashing', () => {
    expect(Object.keys(canonicalizeFilter({ year: { min: 1993, max: 1999 }, edhrec: { min: 1 } }))).toEqual(['edhrec', 'year']);
  });
  it('labels single-bound year ranges', () => {
    expect(modeName({ year: { min: 2003 } })).toContain('≥2003');
    expect(modeName({ year: { max: 2015 } })).toContain('≤2015');
  });
});

describe('UB default = exclude', () => {
  it('drops ub when no/undefined (exclude is the default)', () => {
    expect(canonicalizeFilter({ ub: 'no' }).ub).toBeUndefined();
    expect(canonicalizeFilter({}).ub).toBeUndefined();
  });
  it('keeps yes and only', () => {
    expect(canonicalizeFilter({ ub: 'yes' }).ub).toBe('yes');
    expect(canonicalizeFilter({ ub: 'only' }).ub).toBe('only');
  });
  it('labels include/only but not the default exclude', () => {
    expect(modeName({ ub: 'yes' })).toContain('Incl. UB');
    expect(modeName({ ub: 'only' })).toContain('Universe Beyond');
    expect(modeName({})).not.toContain('UB');
  });
});

describe('popular dimension', () => {
  it('canonicalizes popular only when true, first key', () => {
    expect(canonicalizeFilter({ popular: true }).popular).toBe(true);
    expect(canonicalizeFilter({ popular: false }).popular).toBeUndefined();
    expect(Object.keys(canonicalizeFilter({ popular: true, cmc: { min: 1 } }))).toEqual(['popular', 'cmc']);
  });
  it('labels popular in the mode name', () => {
    expect(modeName({ popular: true })).toContain('Popular');
  });
});
