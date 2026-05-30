export const COLORS = ['W', 'U', 'B', 'R', 'G', 'C'] as const;
export type ColorCode = (typeof COLORS)[number];
export const CARD_TYPES = ['Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker', 'Land', 'Battle'] as const;
export type CardType = (typeof CARD_TYPES)[number];
export const RARITIES = ['common', 'uncommon', 'rare', 'mythic'] as const;
export type Rarity = (typeof RARITIES)[number];

export interface Range {
  min?: number;
  max?: number;
}

export interface CustomFilter {
  cmc?: Range;
  colors?: { values: ColorCode[]; match: 'any' | 'all' };
  types?: CardType[];
  power?: Range;
  toughness?: Range;
  ub?: 'yes' | 'no' | 'only';
  edhrec?: Range;
  sets?: string[];
  rarities?: Rarity[];
}

function cleanRange(r?: Range): Range | undefined {
  if (!r) return undefined;
  const out: Range = {};
  if (typeof r.min === 'number') out.min = r.min;
  if (typeof r.max === 'number') out.max = r.max;
  return Object.keys(out).length ? out : undefined;
}

function sortUnique<T>(xs: T[], order: readonly T[]): T[] {
  return [...new Set(xs)].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

// Returns a new object with keys inserted in a fixed order and empties dropped,
// so JSON.stringify is stable for hashing. Cross-field rules (e.g. power needs
// a creature-only type selection) are enforced by validateFilter, not here.
export function canonicalizeFilter(f: CustomFilter): CustomFilter {
  const out: CustomFilter = {};
  const cmc = cleanRange(f.cmc);
  if (cmc) out.cmc = cmc;
  if (f.colors && f.colors.values.length) {
    out.colors = { match: f.colors.match, values: [...new Set(f.colors.values)].sort() };
  }
  if (f.types && f.types.length) out.types = sortUnique(f.types, CARD_TYPES);
  const power = cleanRange(f.power);
  if (power) out.power = power;
  const toughness = cleanRange(f.toughness);
  if (toughness) out.toughness = toughness;
  if (f.ub && f.ub !== 'yes') out.ub = f.ub; // 'yes' == no filter == default
  const edhrec = cleanRange(f.edhrec);
  if (edhrec) out.edhrec = edhrec;
  if (f.sets && f.sets.length) out.sets = [...new Set(f.sets)].sort();
  if (f.rarities && f.rarities.length) out.rarities = sortUnique(f.rarities, RARITIES);
  return out;
}

// SHA-256 of the canonical filter JSON. Stable across input ordering, so the
// same filter always dedupes to the same mode. Web Crypto is available in the
// browser, Deno, and the jsdom test env.
export async function filterHash(f: CustomFilter): Promise<string> {
  const json = JSON.stringify(canonicalizeFilter(f));
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
