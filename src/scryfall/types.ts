export type Color = 'W' | 'U' | 'B' | 'R' | 'G';

export interface CardImageUris {
  art_crop?: string;
  normal?: string;
  large?: string;
  small?: string;
  png?: string;
}

export interface CardFace {
  name?: string;
  type_line?: string;
  oracle_text?: string;
  colors?: Color[];
  power?: string;
  toughness?: string;
  image_uris?: CardImageUris;
}

/** Only the subset of Scryfall's card object the game needs. */
export interface ScryfallCard {
  id: string;
  name: string;
  cmc: number;
  colors?: Color[];
  color_identity?: Color[];
  type_line: string;
  power?: string;
  toughness?: string;
  rarity?: string;
  set?: string;
  set_name?: string;
  image_uris?: CardImageUris;
  card_faces?: CardFace[];
}

/** Card pool selection chosen on the start screen. */
export type PoolSelection =
  | { kind: 'popular' }
  | { kind: 'sets'; sets: string[] }
  | { kind: 'random' };
