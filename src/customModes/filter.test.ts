import { describe, expect, it } from 'vitest';
import { canonicalizeFilter, filterHash, modeName, type CustomFilter } from './filter';

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
