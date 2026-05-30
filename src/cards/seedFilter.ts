// Pure, I/O-free helpers for the card seed script. Operate on raw Scryfall
// bulk-export objects (looser than the app's ScryfallCard).

export interface RawImageUris {
  normal?: string;
  art_crop?: string;
}

export interface RawCard {
  oracle_id?: string;
  name?: string;
  lang?: string;
  games?: string[];
  layout?: string;
  digital?: boolean;
  border_color?: string;
  full_art?: boolean;
  textless?: boolean;
  frame?: string;
  frame_effects?: string[];
  set_type?: string;
  type_line?: string;
  cmc?: number;
  colors?: string[];
  color_identity?: string[];
  power?: string;
  toughness?: string;
  rarity?: string;
  set?: string;
  set_name?: string;
  edhrec_rank?: number | null;
  image_uris?: RawImageUris;
}

const ALLOWED_FRAMES = new Set(['2003', '2015']);
const BLOCKED_FRAME_EFFECTS = new Set(['showcase', 'extendedart']);
const BLOCKED_SET_TYPES = new Set(['funny', 'memorabilia']);

/** True if this printing should be stored as a selectable artwork. */
export function isEligiblePrinting(c: RawCard): boolean {
  if (!c.oracle_id || !c.name) return false;
  if (c.lang !== 'en') return false;
  if (!c.games?.includes('paper')) return false;
  if (c.layout !== 'normal') return false;
  if (c.digital === true) return false;
  if (c.border_color !== 'black') return false;
  if (c.full_art === true) return false;
  if (c.textless === true) return false;
  if (!c.frame || !ALLOWED_FRAMES.has(c.frame)) return false;
  if (c.frame_effects?.some((f) => BLOCKED_FRAME_EFFECTS.has(f))) return false;
  if (c.set_type && BLOCKED_SET_TYPES.has(c.set_type)) return false;
  if (c.type_line?.startsWith('Basic Land')) return false;
  if (!c.image_uris?.normal || !c.image_uris?.art_crop) return false;
  return true;
}

export interface CardFields {
  oracle_id: string;
  name: string;
  cmc: number | null;
  colors: string[] | null;
  color_identity: string[] | null;
  type_line: string | null;
  power: string | null;
  toughness: string | null;
  edhrec_rank: number | null;
  is_popular: boolean;
  is_ub: boolean;
}

/** Oracle-level fields (popularity/UB flags are filled in later). */
export function toCardFields(c: RawCard): CardFields {
  return {
    oracle_id: c.oracle_id!,
    name: c.name!,
    cmc: c.cmc ?? null,
    colors: c.colors ?? null,
    color_identity: c.color_identity ?? null,
    type_line: c.type_line ?? null,
    power: c.power ?? null,
    toughness: c.toughness ?? null,
    edhrec_rank: c.edhrec_rank ?? null,
    is_popular: false,
    is_ub: false,
  };
}

export interface ArtFields {
  oracle_id: string;
  set_code: string | null;
  set_name: string | null;
  rarity: string | null;
  image_normal: string;
  image_art_crop: string;
}

/** Printing-level artwork fields. */
export function toArtFields(c: RawCard): ArtFields {
  return {
    oracle_id: c.oracle_id!,
    set_code: c.set ?? null,
    set_name: c.set_name ?? null,
    rarity: c.rarity ?? null,
    image_normal: c.image_uris!.normal!,
    image_art_crop: c.image_uris!.art_crop!,
  };
}

/** The `n` oracle ids with the lowest edhrec_rank (null ranks excluded). */
export function topPopularOracleIds(
  cards: { oracle_id: string; edhrec_rank: number | null }[],
  n: number,
): Set<string> {
  const ranked = cards
    .filter((c): c is { oracle_id: string; edhrec_rank: number } => c.edhrec_rank != null)
    .sort((a, b) => a.edhrec_rank - b.edhrec_rank)
    .slice(0, n)
    .map((c) => c.oracle_id);
  return new Set(ranked);
}
