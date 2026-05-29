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

// Restrict to the standard modern frame (cards printed 2015+) so the fixed
// reveal regions (mana cost, type line, power/toughness) line up — and exclude
// full-art / showcase / extended-art / borderless treatments.
const FRAME = 'frame:2015 border:black -is:showcase -is:extendedart -is:fullart -is:borderless';
// Scryfall returns 175 results per search page.
const PAGE_SIZE = 175;
// Cap how deep we jump for the "all" pool so the offset stays sane.
const MAX_RANDOM_PAGE = 40;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildSearchQuery(input: PoolSelection): string {
  // Universes Beyond crossover cards (e.g. LOTR, Final Fantasy) are matched by
  // Scryfall's `is:ub`; exclude them when the player asks for MTG-native cards.
  const ub = input.excludeUniverseBeyond ? ' -is:ub' : '';
  switch (input.kind) {
    case 'popular':
      return `format:commander ${FRAME}${ub}`;
    case 'all':
      return `-is:funny game:paper ${FRAME}${ub}`;
  }
}

interface SearchPage {
  data: ScryfallCard[];
  has_more: boolean;
  total_cards?: number;
}

async function fetchSearchPage(q: string, order: string, page: number): Promise<SearchPage> {
  const url = `${BASE}/cards/search?q=${q}&order=${order}&page=${page}`;
  const res = await fetchWithRetry(url);
  return res.json();
}

export async function fetchCandidates(
  input: PoolSelection,
  // A timed game can run through many cards, so keep a full search page on hand
  // — enough that pre-planned rounds never have to repeat a name.
  limit = PAGE_SIZE,
): Promise<ScryfallCard[]> {
  const q = encodeURIComponent(buildSearchQuery(input));
  // "popular" is sorted by EDHREC rank so the first page is genuinely well-known
  // cards. "all" reads a random page so each game pulls a different slice.
  const order = input.kind === 'popular' ? 'edhrec' : 'name';
  const first = await fetchSearchPage(q, order, 1);

  let data = first.data;
  if (input.kind === 'all' && first.total_cards && first.total_cards > PAGE_SIZE) {
    const pages = Math.min(Math.ceil(first.total_cards / PAGE_SIZE), MAX_RANDOM_PAGE);
    const page = 1 + Math.floor(Math.random() * pages);
    if (page !== 1) {
      const more = await fetchSearchPage(q, order, page);
      if (more.data?.length) data = more.data;
    }
  }

  return shuffle(data.filter(hasNormalImage)).slice(0, limit);
}
