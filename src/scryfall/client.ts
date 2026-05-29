import type { ScryfallCard, PoolSelection } from './types';

const BASE = 'https://api.scryfall.com';
const HEADERS = { Accept: 'application/json' };
const RATE_MS = 100;
const MAX_RETRIES = 4;
const MAX_ART_SKIPS = 5;

let lastRequestAt = 0;
export function _resetRateLimit() { lastRequestAt = 0; }

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const wait = RATE_MS - (now - lastRequestAt);
  if (wait > 0) {
    await new Promise<void>((r) => setTimeout(r, wait));
  }
  lastRequestAt = Date.now();
  return fetch(url, { headers: HEADERS });
}

function hasArt(card: ScryfallCard): boolean {
  if (card.image_uris?.art_crop) return true;
  if (card.card_faces?.some((f) => f.image_uris?.art_crop)) return true;
  return false;
}

function hasNormalImage(card: ScryfallCard): boolean {
  if (card.image_uris?.normal) return true;
  if (card.card_faces?.[0]?.image_uris?.normal) return true;
  return false;
}

async function fetchWithRetry(url: string): Promise<Response> {
  let delay = 500;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await rateLimitedFetch(url);
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await new Promise<void>((r) => setTimeout(r, delay));
        delay *= 2;
        continue;
      }
      throw err;
    }
    if (res.ok) return res;
    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After');
      const wait = retryAfter ? parseFloat(retryAfter) * 1000 : delay;
      if (attempt < MAX_RETRIES) {
        await new Promise<void>((r) => setTimeout(r, wait));
        delay *= 2;
        continue;
      }
    }
    if (attempt < MAX_RETRIES) {
      await new Promise<void>((r) => setTimeout(r, delay));
      delay *= 2;
      continue;
    }
    throw new Error(`Scryfall request failed: ${res.status} ${res.statusText} for ${url}`);
  }
  throw new Error(`Scryfall request failed after ${MAX_RETRIES} retries: ${url}`);
}

export async function fetchRandomCard(query?: string): Promise<ScryfallCard> {
  for (let skip = 0; skip < MAX_ART_SKIPS; skip++) {
    const url = query
      ? `${BASE}/cards/random?q=${encodeURIComponent(query)}`
      : `${BASE}/cards/random`;
    const res = await fetchWithRetry(url);
    const card: ScryfallCard = await res.json();
    if (hasArt(card)) return card;
  }
  throw new Error('Could not find a card with art after maximum retries');
}

// Restrict to the standard modern frame so the fixed reveal regions (mana cost,
// type line, power/toughness) line up — exclude full-art/showcase/borderless treatments.
const FRAME = 'frame:2015 border:black -is:showcase -is:extendedart -is:fullart -is:borderless';

function buildSearchQuery(input: PoolSelection): string {
  switch (input.kind) {
    case 'popular':
      return `format:commander ${FRAME}`;
    case 'sets':
      return `(${input.sets.map((s) => `set:${s}`).join(' or ')}) ${FRAME}`;
    case 'random':
      return `-is:funny ${FRAME}`;
  }
}

export async function fetchCandidates(
  input: PoolSelection,
  limit = 30,
): Promise<ScryfallCard[]> {
  const q = encodeURIComponent(buildSearchQuery(input));
  const url = `${BASE}/cards/search?q=${q}`;
  const res = await fetchWithRetry(url);
  const body: { data: ScryfallCard[]; has_more: boolean; next_page?: string } = await res.json();
  return body.data.filter(hasNormalImage).slice(0, limit);
}
