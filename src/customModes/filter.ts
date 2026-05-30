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
  year?: Range;
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
  if (f.ub && f.ub !== 'no') out.ub = f.ub; // 'no' (exclude) is the default
  const edhrec = cleanRange(f.edhrec);
  if (edhrec) out.edhrec = edhrec;
  const year = cleanRange(f.year);
  if (year) out.year = year;
  if (f.sets && f.sets.length) out.sets = [...new Set(f.sets)].sort();
  if (f.rarities && f.rarities.length) out.rarities = sortUnique(f.rarities, RARITIES);
  return out;
}

export type ValidateResult = { ok: true } | { ok: false; reason: string };

function rangeOrdered(r?: Range): boolean {
  return !r || r.min == null || r.max == null || r.min <= r.max;
}

// Cross-field rules the canonical shape can't express: ordered ranges,
// power/toughness only with a creature-only type selection, and the single-set
// exclusivity rule (one set ⇒ no other filters).
export function validateFilter(filter: CustomFilter): ValidateResult {
  const f = canonicalizeFilter(filter);
  for (const r of [f.cmc, f.power, f.toughness, f.edhrec, f.year]) {
    if (!rangeOrdered(r)) return { ok: false, reason: 'bad-range' };
  }
  const hasPT = !!(f.power || f.toughness);
  const creatureOnly = f.types?.length === 1 && f.types[0] === 'Creature';
  if (hasPT && !creatureOnly) return { ok: false, reason: 'pt-requires-creature' };

  if (f.sets?.length === 1) {
    const otherKeys = Object.keys(f).filter((k) => k !== 'sets');
    if (otherKeys.length > 0) return { ok: false, reason: 'single-set-exclusive' };
  }
  return { ok: true };
}

const COLOR_WORD: Record<ColorCode, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green', C: 'Colorless' };
const TYPE_PLURAL: Record<CardType, string> = {
  Creature: 'Creatures', Instant: 'Instants', Sorcery: 'Sorceries', Artifact: 'Artifacts',
  Enchantment: 'Enchantments', Planeswalker: 'Planeswalkers', Land: 'Lands', Battle: 'Battles',
};

function rangeLabel(prefix: string, r?: Range): string | null {
  if (!r || (r.min == null && r.max == null)) return null;
  if (r.min != null && r.max != null) return `${prefix} ${r.min}–${r.max}`;
  if (r.min != null) return `${prefix} ≥${r.min}`;
  return `${prefix} ≤${r.max}`;
}

// Human-readable label derived deterministically from the filter, used as the
// auto-generated mode name and for the filter chips.
export function modeName(filter: CustomFilter): string {
  const f = canonicalizeFilter(filter);
  const parts: string[] = [];

  let head = '';
  if (f.colors) {
    const words = f.colors.values.map((c) => COLOR_WORD[c]);
    if (f.colors.values.length === 1) head = `Mono-${words[0]}`;
    else head = f.colors.match === 'all' ? words.join('+') : words.join('/');
  }
  const typeWords = (f.types ?? []).map((t) => TYPE_PLURAL[t]);
  const typeLabel = typeWords.length
    ? typeWords.slice(0, -1).join(', ') + (typeWords.length > 1 ? ' & ' : '') + typeWords[typeWords.length - 1]
    : '';
  const headline = [head, typeLabel || (head ? 'Cards' : '')].filter(Boolean).join(' ');
  if (headline) parts.push(headline);

  const cmc = rangeLabel('CMC', f.cmc);
  if (cmc) parts.push(cmc);
  const pow = rangeLabel('Pow', f.power);
  if (pow) parts.push(pow);
  const tou = rangeLabel('Tou', f.toughness);
  if (tou) parts.push(tou);
  const edh = rangeLabel('EDH', f.edhrec);
  if (edh) parts.push(edh);
  if (f.year) {
    if (f.year.min != null && f.year.max != null) parts.push(`${f.year.min}–${f.year.max}`);
    else if (f.year.min != null) parts.push(`≥${f.year.min}`);
    else if (f.year.max != null) parts.push(`≤${f.year.max}`);
  }
  if (f.ub === 'only') parts.push('Universe Beyond');
  if (f.ub === 'yes') parts.push('Incl. UB');
  if (f.sets?.length) parts.push(f.sets.length === 1 ? f.sets[0].toUpperCase() : `${f.sets.length} sets`);
  if (f.rarities?.length) parts.push(f.rarities.map((r) => r[0].toUpperCase() + r.slice(1)).join('/'));

  return parts.length ? parts.join(' · ') : 'All cards (custom)';
}

// SHA-256 of the canonical filter JSON. Stable across input ordering, so the
// same filter always dedupes to the same mode. Web Crypto is available in the
// browser, Deno, and the jsdom test env.
export async function filterHash(f: CustomFilter): Promise<string> {
  const json = JSON.stringify(canonicalizeFilter(f));
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
