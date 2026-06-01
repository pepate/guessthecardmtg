import { describe, it, expect } from 'vitest';
import { berlinToday } from './client';

describe('berlinToday', () => {
  it('returns a YYYY-MM-DD string', () => {
    expect(berlinToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
