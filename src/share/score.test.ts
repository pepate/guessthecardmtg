import { describe, it, expect } from 'vitest';
import { encodeResult, decodeResult } from './score';

describe('share token', () => {
  it('round-trips a result', () => {
    const r = { score: 4820, correct: 7, pool: 'all' as const };
    expect(decodeResult(encodeResult(r))).toEqual(r);
  });

  it('round-trips the popular pool flag', () => {
    const r = { score: 100, correct: 1, pool: 'popular' as const };
    expect(decodeResult(encodeResult(r))).toEqual(r);
  });

  it('rejects a token with a tampered payload', () => {
    const token = encodeResult({ score: 100, correct: 1, pool: 'popular' });
    const [payload, sig] = token.split('.');
    // Bump the payload but keep the original signature.
    const forged = `${payload}A.${sig}`;
    expect(decodeResult(forged)).toBeNull();
  });

  it('rejects a token with a tampered signature', () => {
    const token = encodeResult({ score: 999, correct: 9, pool: 'all' });
    const [payload] = token.split('.');
    expect(decodeResult(`${payload}.deadbeef`)).toBeNull();
  });

  it('rejects empty or malformed tokens', () => {
    expect(decodeResult(null)).toBeNull();
    expect(decodeResult('')).toBeNull();
    expect(decodeResult('garbage')).toBeNull();
  });
});
