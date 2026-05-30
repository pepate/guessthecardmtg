export interface ArtworkInfo {
  name: string;
  setName: string;
  year: string;
  artist: string;
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Extract the printing's Scryfall UUID from any cards.scryfall.io image URL.
 *  Returns null if no UUID is found. */
export function scryfallIdFromImageUrl(url: string): string | null {
  return url.match(UUID_RE)?.[0] ?? null;
}

const cache = new Map<string, ArtworkInfo>();
// De-dupes concurrent lookups so a double-trigger fires only one request.
const inFlight = new Map<string, Promise<ArtworkInfo>>();

interface ScryfallCardJson {
  name?: string;
  set_name?: string;
  released_at?: string;
  artist?: string;
}

/** Fetch printing metadata by Scryfall card id. Results cached in-memory by id
 *  (so repeated lookups don't re-hit the API — be gentle on Scryfall). */
export async function fetchArtworkInfo(id: string): Promise<ArtworkInfo> {
  const cached = cache.get(id);
  if (cached) return cached;

  const pending = inFlight.get(id);
  if (pending) return pending;

  const req = (async () => {
    const res = await fetch('https://api.scryfall.com/cards/' + id, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Scryfall request failed: ${res.status}`);
    const json = (await res.json()) as ScryfallCardJson;
    const info: ArtworkInfo = {
      name: json.name ?? '',
      setName: json.set_name ?? '',
      year: (json.released_at ?? '').slice(0, 4),
      artist: json.artist ?? '',
    };
    cache.set(id, info);
    return info;
  })();

  inFlight.set(id, req);
  try {
    return await req;
  } finally {
    inFlight.delete(id);
  }
}
