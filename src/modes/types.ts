import type { CustomFilter } from './filter';

export interface CustomMode {
  id: string;
  name: string;
  filter: CustomFilter;
  card_count: number;
  slug?: string;
}
export interface CustomModeListItem extends CustomMode {
  entry_count: number;
}
export type CreateModeResult =
  | { ok: true; existed: boolean; mode: CustomMode }
  | { ok: false; reason: string; count?: number };
