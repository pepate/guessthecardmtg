import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scryfallIdFromImageUrl, fetchArtworkInfo } from './client';

const realFetch = globalThis.fetch;

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('scryfallIdFromImageUrl', () => {
  it('extracts the UUID from a real-shaped art_crop URL with a query string', () => {
    const url =
      'https://cards.scryfall.io/art_crop/front/7/6/7657b686-116d-45a7-8856-fe56f2db14a2.jpg?1680826879';
    expect(scryfallIdFromImageUrl(url)).toBe('7657b686-116d-45a7-8856-fe56f2db14a2');
  });

  it('returns null when no UUID is present', () => {
    expect(scryfallIdFromImageUrl('https://example.com/no-id-here.jpg')).toBeNull();
  });
});

describe('fetchArtworkInfo', () => {
  // Unique ids per case keep the module-level cache from leaking across tests.
  let n = 0;
  const freshId = () => `id-${++n}-${Date.now()}`;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('maps fields and derives a 4-char year from released_at', async () => {
    const id = freshId();
    const f = vi.fn().mockResolvedValue(
      jsonResponse({
        name: 'Lightning Bolt',
        set_name: 'Magic 2010',
        released_at: '2009-07-17',
        artist: 'Christopher Moeller',
      }),
    );
    globalThis.fetch = f as unknown as typeof fetch;

    const info = await fetchArtworkInfo(id);
    expect(info).toEqual({
      name: 'Lightning Bolt',
      setName: 'Magic 2010',
      year: '2009',
      artist: 'Christopher Moeller',
    });
    expect(f).toHaveBeenCalledWith('https://api.scryfall.com/cards/' + id, {
      headers: { Accept: 'application/json' },
    });
  });

  it('falls back to empty strings for missing fields', async () => {
    const id = freshId();
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({})) as unknown as typeof fetch;
    const info = await fetchArtworkInfo(id);
    expect(info).toEqual({ name: '', setName: '', year: '', artist: '' });
  });

  it('serves a cache hit without calling fetch a second time', async () => {
    const id = freshId();
    const f = vi.fn().mockResolvedValue(jsonResponse({ name: 'Counterspell' }));
    globalThis.fetch = f as unknown as typeof fetch;

    await fetchArtworkInfo(id);
    await fetchArtworkInfo(id);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('throws on a non-ok response', async () => {
    const id = freshId();
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(null, false, 404)) as unknown as typeof fetch;
    await expect(fetchArtworkInfo(id)).rejects.toThrow();
  });

  it('de-dupes concurrent in-flight requests for the same id', async () => {
    const id = freshId();
    const f = vi.fn().mockResolvedValue(jsonResponse({ name: 'Brainstorm' }));
    globalThis.fetch = f as unknown as typeof fetch;

    const [a, b] = await Promise.all([fetchArtworkInfo(id), fetchArtworkInfo(id)]);
    expect(a).toEqual(b);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
