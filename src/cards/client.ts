import { getSupabase } from '../supabase/client';
import type { ScryfallCard, PoolSelection, Color } from '../scryfall/types';

// Matches one row returned by the get_game_cards RPC.
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

async function queryGameCards(
  pool: 'popular' | 'all',
  count: number,
  excludeUb: boolean,
): Promise<ScryfallCard[]> {
  const c = getSupabase();
  if (!c) throw new Error('Card database is not configured.');
  const { data, error } = await c.rpc('get_game_cards', {
    p_pool: pool,
    p_count: count,
    p_exclude_ub: excludeUb,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as GameCardRow[]).map(rowToCard);
}

/** Random distinct cards for one game, each with a random artwork. */
export function fetchCandidates(
  input: PoolSelection,
  limit = DEFAULT_LIMIT,
): Promise<ScryfallCard[]> {
  return queryGameCards(input.kind, limit, input.excludeUniverseBeyond);
}

/** One random card — used for the start-screen splash artwork. */
export async function fetchRandomCard(): Promise<ScryfallCard> {
  const cards = await queryGameCards('all', 1, false);
  if (cards.length === 0) throw new Error('No card returned.');
  return cards[0];
}
