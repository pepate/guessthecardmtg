import { describe, expect, it } from 'vitest';
import { canonicalizeFilter, type CustomFilter } from './filter';

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
