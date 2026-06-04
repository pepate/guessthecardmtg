import { describe, it, expect } from 'vitest';
import { recentDistinctIds, fillToLimit } from './recent';
import type { CustomMode } from './types';

const mode = (id: string): CustomMode => ({ id, name: id, filter: {}, card_count: 10 });

describe('recentDistinctIds', () => {
  it('keeps the first occurrence of each mode_id, newest first, capped at limit', () => {
    const rows = [
      { mode_id: 'a' }, { mode_id: 'b' }, { mode_id: 'a' }, { mode_id: 'c' }, { mode_id: 'd' }, { mode_id: 'e' },
    ];
    expect(recentDistinctIds(rows, 4)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('returns fewer than limit when there are fewer distinct ids', () => {
    expect(recentDistinctIds([{ mode_id: 'a' }, { mode_id: 'a' }], 4)).toEqual(['a']);
  });
});

describe('fillToLimit', () => {
  it('appends extras not already present, up to the limit', () => {
    const out = fillToLimit([mode('a'), mode('b')], [mode('b'), mode('c'), mode('d'), mode('e')], 4);
    expect(out.map((m) => m.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('never exceeds the limit even if primary already has enough', () => {
    const out = fillToLimit([mode('a'), mode('b'), mode('c'), mode('d')], [mode('e')], 4);
    expect(out.map((m) => m.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});
