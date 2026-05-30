import { describe, it, expect } from 'vitest';
import { formatAge } from './age';

const NOW = 1_000_000_000_000;
const ago = (ms: number) => NOW - ms;
const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H;

describe('formatAge', () => {
  it('shows "just now" under a minute', () => {
    expect(formatAge(ago(30 * S), NOW)).toBe('just now');
  });
  it('shows minutes', () => {
    expect(formatAge(ago(5 * M), NOW)).toBe('5m ago');
  });
  it('shows hours', () => {
    expect(formatAge(ago(3 * H), NOW)).toBe('3h ago');
  });
  it('shows days', () => {
    expect(formatAge(ago(2 * D), NOW)).toBe('2d ago');
  });
  it('clamps a future timestamp to "just now"', () => {
    expect(formatAge(NOW + 5 * S, NOW)).toBe('just now');
  });
});
