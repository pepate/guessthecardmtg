import { describe, it, expect } from 'vitest';
import { sanitizeName, validateScore, NAME_MAX } from './validation';

describe('sanitizeName', () => {
  it('trims and collapses whitespace', () => {
    expect(sanitizeName('  Jo   hn  ')).toBe('Jo hn');
  });
  it('strips control characters', () => {
    expect(sanitizeName('Ab\u0000\u0007cd')).toBe('Abcd');
  });
  it('caps at NAME_MAX characters', () => {
    expect(sanitizeName('x'.repeat(40))).toBe('x'.repeat(NAME_MAX));
  });
  it('rejects names shorter than NAME_MIN', () => {
    expect(sanitizeName('ab')).toBeNull();
    expect(sanitizeName('   ')).toBeNull();
  });
  it('accepts a name exactly NAME_MIN long', () => {
    expect(sanitizeName('abc')).toBe('abc');
  });
});

describe('validateScore', () => {
  it('accepts a plausible score', () => {
    expect(validateScore(5000, 10)).toBe(true); // within 10*[100,1000]
  });
  it('rejects a score above the per-card max', () => {
    expect(validateScore(10001, 10)).toBe(false);
  });
  it('rejects a score below the per-card min', () => {
    expect(validateScore(999, 10)).toBe(false);
  });
  it('requires score 0 when correct is 0', () => {
    expect(validateScore(0, 0)).toBe(true);
    expect(validateScore(100, 0)).toBe(false);
  });
  it('rejects more than 40 correct', () => {
    expect(validateScore(4100, 41)).toBe(false);
  });
  it('rejects non-integers', () => {
    expect(validateScore(100.5, 1)).toBe(false);
    expect(validateScore(500, 1.5)).toBe(false);
  });
});
