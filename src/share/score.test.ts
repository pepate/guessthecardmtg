import { describe, it, expect, afterEach, vi } from 'vitest';
import { encodeResult, decodeResult, shareLink, shareUrl, encodeModeShare, decodeModeShare, modeShareLink } from './score';

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

describe('shareLink', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('targets the edge function when VITE_SUPABASE_URL is set', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    const result = { score: 4820, correct: 7, pool: 'all' as const };
    const link = shareLink(result);
    expect(link.startsWith('https://example.supabase.co/functions/v1/share?r=')).toBe(true);
    expect(link).toContain(encodeResult(result));
  });

  it('falls back to shareUrl when VITE_SUPABASE_URL is empty', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    const result = { score: 100, correct: 1, pool: 'popular' as const };
    expect(shareLink(result)).toBe(shareUrl(result));
  });
});

describe('mode share token', () => {
  const m = { modeId: '11111111-1111-1111-1111-111111111111', modeName: 'EDHRec 100', score: 6874 };

  it('round-trips a mode share', () => {
    expect(decodeModeShare(encodeModeShare(m))).toEqual(m);
  });

  it('is not confused with a score token (and vice-versa)', () => {
    expect(decodeResult(encodeModeShare(m))).toBeNull();
    expect(decodeModeShare(encodeResult({ score: 100, correct: 1, pool: 'all' }))).toBeNull();
  });

  it('rejects a tampered mode token', () => {
    const [payload, sig] = encodeModeShare(m).split('.');
    expect(decodeModeShare(`${payload}A.${sig}`)).toBeNull();
  });
});

describe('modeShareLink', () => {
  afterEach(() => vi.unstubAllEnvs());
  const m = { modeId: '11111111-1111-1111-1111-111111111111', modeName: 'EDHRec 100', score: 6874 };

  it('targets the edge function when VITE_SUPABASE_URL is set', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    const link = modeShareLink(m);
    expect(link.startsWith('https://example.supabase.co/functions/v1/share?r=')).toBe(true);
    expect(link).toContain(encodeModeShare(m));
  });

  it('falls back to a plain ?m= link when VITE_SUPABASE_URL is empty', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    expect(modeShareLink(m)).toContain(`?m=${m.modeId}`);
  });
});
