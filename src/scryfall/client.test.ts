import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchRandomCard, fetchCandidates, _resetRateLimit } from './client';
import type { ScryfallCard } from './types';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeCard(overrides: Partial<ScryfallCard> = {}): ScryfallCard {
  return {
    id: 'abc',
    name: 'Test Card',
    cmc: 3,
    type_line: 'Creature — Human',
    image_uris: { art_crop: 'https://example.com/art.jpg', normal: 'https://example.com/normal.jpg' },
    ...overrides,
  };
}

function okResponse(body: unknown, headers: Record<string, string> = {}): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: (k: string) => headers[k] ?? null } as unknown as Headers,
    json: async () => body,
  } as unknown as Response;
}

function errorResponse(status: number, headers: Record<string, string> = {}): Response {
  return {
    ok: false,
    status,
    statusText: String(status),
    headers: { get: (k: string) => headers[k] ?? null } as unknown as Headers,
    json: async () => ({}),
  } as unknown as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
  vi.useFakeTimers();
  _resetRateLimit();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('fetchRandomCard', () => {
  it('fetches from /cards/random without query', async () => {
    mockFetch.mockResolvedValueOnce(okResponse(makeCard()));
    const promise = fetchRandomCard();
    await vi.runAllTimersAsync();
    const card = await promise;
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.scryfall.com/cards/random',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
    expect(card.name).toBe('Test Card');
  });

  it('appends URL-encoded q param when query is supplied', async () => {
    mockFetch.mockResolvedValueOnce(okResponse(makeCard()));
    const promise = fetchRandomCard('format:standard is:funny');
    await vi.runAllTimersAsync();
    await promise;
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('q=format%3Astandard%20is%3Afunny');
  });

  it('skips cards with no art_crop and retries', async () => {
    const noArt = makeCard({ image_uris: {} });
    const withArt = makeCard();
    mockFetch
      .mockResolvedValueOnce(okResponse(noArt))
      .mockResolvedValueOnce(okResponse(withArt));
    const promise = fetchRandomCard();
    await vi.runAllTimersAsync();
    const card = await promise;
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(card.image_uris?.art_crop).toBeDefined();
  });

  it('accepts a card whose art is on a card_face', async () => {
    const faceCard = makeCard({
      image_uris: undefined,
      card_faces: [
        { image_uris: { art_crop: 'https://example.com/face.jpg' } },
      ],
    });
    mockFetch.mockResolvedValueOnce(okResponse(faceCard));
    const promise = fetchRandomCard();
    await vi.runAllTimersAsync();
    const card = await promise;
    expect(card.card_faces![0].image_uris?.art_crop).toBeDefined();
  });

  it('throws after exhausting MAX_ART_SKIPS cards with no art', async () => {
    const noArt = makeCard({ image_uris: {} });
    for (let i = 0; i < 5; i++) {
      mockFetch.mockResolvedValueOnce(okResponse(noArt));
    }
    const promise = fetchRandomCard();
    const assertion = expect(promise).rejects.toThrow('Could not find a card with art');
    await vi.runAllTimersAsync();
    await assertion;
  });

  it('retries on 429 and respects Retry-After header', async () => {
    mockFetch
      .mockResolvedValueOnce(errorResponse(429, { 'Retry-After': '1' }))
      .mockResolvedValueOnce(okResponse(makeCard()));
    const promise = fetchRandomCard();
    await vi.runAllTimersAsync();
    const card = await promise;
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(card.name).toBe('Test Card');
  });

  it('retries on network-level error then succeeds', async () => {
    mockFetch
      .mockRejectedValueOnce(new TypeError('network error'))
      .mockResolvedValueOnce(okResponse(makeCard()));
    const promise = fetchRandomCard();
    await vi.runAllTimersAsync();
    const card = await promise;
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(card.name).toBe('Test Card');
  });

  it('throws after exhausting retries on non-ok response', async () => {
    for (let i = 0; i <= 4; i++) {
      mockFetch.mockResolvedValueOnce(errorResponse(503));
    }
    const promise = fetchRandomCard();
    const assertion = expect(promise).rejects.toThrow('503');
    await vi.runAllTimersAsync();
    await assertion;
  });
});

describe('fetchCandidates', () => {
  it('builds query for popular pool', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({ data: [makeCard()], has_more: false }));
    const promise = fetchCandidates({ kind: 'popular' });
    await vi.runAllTimersAsync();
    await promise;
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('format%3Acommander');
  });

  it('builds query for sets pool', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({ data: [makeCard()], has_more: false }));
    const promise = fetchCandidates({ kind: 'sets', sets: ['neo', 'ltr'] });
    await vi.runAllTimersAsync();
    await promise;
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('set%3Aneo');
    expect(url).toContain('set%3Altr');
  });

  it('builds query for random pool using -is:funny', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({ data: [makeCard()], has_more: false }));
    const promise = fetchCandidates({ kind: 'random' });
    await vi.runAllTimersAsync();
    await promise;
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('-is%3Afunny');
  });

  it('filters out cards without art', async () => {
    const noArt = makeCard({ id: 'noart', image_uris: {} });
    const withArt = makeCard({ id: 'art' });
    mockFetch.mockResolvedValueOnce(
      okResponse({ data: [noArt, withArt], has_more: false }),
    );
    const promise = fetchCandidates({ kind: 'popular' });
    await vi.runAllTimersAsync();
    const cards = await promise;
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe('art');
  });

  it('respects the limit parameter', async () => {
    const data = Array.from({ length: 20 }, (_, i) => makeCard({ id: `c${i}` }));
    mockFetch.mockResolvedValueOnce(okResponse({ data, has_more: false }));
    const promise = fetchCandidates({ kind: 'popular' }, 5);
    await vi.runAllTimersAsync();
    const cards = await promise;
    expect(cards).toHaveLength(5);
  });
});

describe('rate limiting', () => {
  it('spaces consecutive calls by at least 100 ms', async () => {
    const timestamps: number[] = [];
    mockFetch.mockImplementation(async () => {
      timestamps.push(Date.now());
      return okResponse(makeCard());
    });

    const p1 = fetchRandomCard();
    const p2 = fetchRandomCard();
    await vi.runAllTimersAsync();
    await Promise.all([p1, p2]);

    expect(timestamps).toHaveLength(2);
    expect(timestamps[1] - timestamps[0]).toBeGreaterThanOrEqual(100);
  });
});
