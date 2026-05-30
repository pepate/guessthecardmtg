import { describe, it, expect } from 'vitest';
import { countryToFlag } from './flag';

describe('countryToFlag', () => {
  it('converts a valid code to regional-indicator emoji', () => {
    expect(countryToFlag('DE')).toBe('\u{1F1E9}\u{1F1EA}');
  });
  it('is case-insensitive', () => {
    expect(countryToFlag('us')).toBe('\u{1F1FA}\u{1F1F8}');
  });
  it('returns empty string for null', () => {
    expect(countryToFlag(null)).toBe('');
  });
  it('returns empty string for malformed codes', () => {
    expect(countryToFlag('XYZ')).toBe('');
    expect(countryToFlag('1')).toBe('');
  });
});
