import { describe, it, expect } from 'vitest';
import { formatAge } from './age';

const NOW = 1_000_000_000_000;
const ago = (ms: number) => NOW - ms;
const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H;

describe('formatAge', () => {
  it('shows "gerade eben" under a minute', () => {
    expect(formatAge(ago(30 * S), NOW)).toBe('gerade eben');
  });
  it('shows minutes', () => {
    expect(formatAge(ago(5 * M), NOW)).toBe('vor 5 Min.');
  });
  it('shows hours', () => {
    expect(formatAge(ago(3 * H), NOW)).toBe('vor 3 Std.');
  });
  it('shows days', () => {
    expect(formatAge(ago(2 * D), NOW)).toBe('vor 2 Tg.');
  });
  it('clamps a future timestamp to "gerade eben"', () => {
    expect(formatAge(NOW + 5 * S, NOW)).toBe('gerade eben');
  });
});
