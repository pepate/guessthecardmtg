import { describe, it, expect } from 'vitest';
import { SUMMONING_TEXTS } from './summoningTexts';

describe('SUMMONING_TEXTS', () => {
  it('has exactly 40 entries', () => {
    expect(SUMMONING_TEXTS).toHaveLength(40);
  });
  it('every entry is non-empty', () => {
    for (const t of SUMMONING_TEXTS) expect(t.trim().length).toBeGreaterThan(0);
  });
  it('all entries are unique', () => {
    expect(new Set(SUMMONING_TEXTS).size).toBe(SUMMONING_TEXTS.length);
  });
});
