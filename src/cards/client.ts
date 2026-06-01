import { getSupabase } from '../supabase/client';
import type { ScryfallCard, Color } from '../scryfall/types';
import type { CustomFilter } from '../modes/filter';

// Matches one row returned by the get_filtered_game_cards RPC.
export interface GameCardRow {
  oracle_id: string;
  name: string;
  cmc: number | null;
  colors: string[] | null;
  color_identity: string[] | null;
  type_line: string | null;
  power: string | null;
  toughness: string | null;
  rarity: string | null;
  set_code: string | null;
  set_name: string | null;
  image_normal: string;
  image_art_crop: string;
}

// A full search page's worth of cards, so pre-planned rounds never repeat.
const DEFAULT_LIMIT = 175;

/** Map an RPC row onto the app's internal ScryfallCard shape. */
export function rowToCard(r: GameCardRow): ScryfallCard {
  return {
    id: r.oracle_id,
    name: r.name,
    cmc: r.cmc ?? 0,
    colors: (r.colors ?? undefined) as Color[] | undefined,
    color_identity: (r.color_identity ?? undefined) as Color[] | undefined,
    type_line: r.type_line ?? '',
    power: r.power ?? undefined,
    toughness: r.toughness ?? undefined,
    rarity: r.rarity ?? undefined,
    set: r.set_code ?? undefined,
    set_name: r.set_name ?? undefined,
    image_uris: { normal: r.image_normal, art_crop: r.image_art_crop },
  };
}

async function fetchFilteredCards(filter: CustomFilter, count = DEFAULT_LIMIT): Promise<ScryfallCard[]> {
  const c = getSupabase();
  if (!c) throw new Error('Card database is not configured.');
  const { data, error } = await c.rpc('get_filtered_game_cards', { p_filter: filter, p_count: count });
  if (error) throw new Error(error.message);
  return ((data ?? []) as GameCardRow[]).map(rowToCard);
}

/** Random distinct cards for one game, each with a random artwork. */
export function fetchCandidates(filter: CustomFilter, limit = DEFAULT_LIMIT): Promise<ScryfallCard[]> {
  return fetchFilteredCards(filter, limit);
}

/** One random card — used for the start-screen splash artwork. */
export async function fetchRandomCard(): Promise<ScryfallCard> {
  const cards = await fetchFilteredCards({}, 1);
  if (cards.length === 0) throw new Error('No card returned.');
  return cards[0];
}

/** The art_crop of the pool's most-popular card (smallest edhrec_rank), or null. */
export async function fetchModeTopArt(filter: CustomFilter): Promise<string | null> {
  const c = getSupabase();
  if (!c) return null;
  const { data, error } = await c.rpc('mode_top_card_art', { p_filter: filter });
  return !error && typeof data === 'string' ? data : null;
}
