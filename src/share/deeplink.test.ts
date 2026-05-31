import { describe, it, expect, beforeEach } from 'vitest';
import { buildDeeplink, parseDeeplink } from './deeplink';

const UUID = '97c50862-b555-46f1-932e-c3ad963f102a';

beforeEach(() => {
  // Same-origin relative path — jsdom rejects cross-origin replaceState.
  window.history.replaceState({}, '', '/app/');
});

describe('buildDeeplink', () => {
  it('produces a url carrying mode id and reveal, dropping prior query', () => {
    window.history.replaceState({}, '', '/app/?stale=1');
    const parsed = new URL(buildDeeplink(UUID, 'blur'));
    expect(parsed.searchParams.get('m')).toBe(UUID);
    expect(parsed.searchParams.get('r')).toBe('blur');
    expect(parsed.searchParams.get('stale')).toBeNull();
  });
});

describe('parseDeeplink', () => {
  it('parses a valid deeplink', () => {
    expect(parseDeeplink(`?m=${UUID}&r=spotlight`)).toEqual({ modeId: UUID, reveal: 'spotlight' });
  });
  it('round-trips buildDeeplink output', () => {
    const url = new URL(buildDeeplink(UUID, 'mosaic'));
    expect(parseDeeplink(url.search)).toEqual({ modeId: UUID, reveal: 'mosaic' });
  });
  it('rejects a missing or malformed mode id', () => {
    expect(parseDeeplink('?r=blur')).toBeNull();
    expect(parseDeeplink('?m=not-a-uuid&r=blur')).toBeNull();
  });
  it('rejects an unknown reveal mode', () => {
    expect(parseDeeplink(`?m=${UUID}&r=banana`)).toBeNull();
    expect(parseDeeplink(`?m=${UUID}`)).toBeNull();
  });
  it('returns null for empty search', () => {
    expect(parseDeeplink('')).toBeNull();
  });
});
