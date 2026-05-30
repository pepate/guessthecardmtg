import { getSupabase } from '../supabase/client';
import { rowToCard, type GameCardRow } from '../cards/client';
import type { ScryfallCard } from '../scryfall/types';
import { canonicalizeFilter, filterHash, modeName, type CustomFilter } from './filter';
import type { CreateModeResult, CustomMode, CustomModeListItem } from './types';

export interface SetItem {
  code: string;
  name: string;
  released_at: string | null;
}

export async function countFilteredCards(filter: CustomFilter): Promise<number> {
  const c = getSupabase();
  if (!c) return 0;
  const { data, error } = await c.rpc('count_filtered_cards', { p_filter: canonicalizeFilter(filter) });
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}

export async function listModes(limit = 50): Promise<CustomModeListItem[]> {
  const c = getSupabase();
  if (!c) return [];
  const { data, error } = await c.from('custom_mode_list')
    .select('id,name,filter,card_count,entry_count')
    .order('entry_count', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as CustomModeListItem[];
}

export async function getMode(id: string): Promise<CustomMode | null> {
  const c = getSupabase();
  if (!c) return null;
  const { data, error } = await c.from('custom_mode').select('id,name,filter,card_count').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CustomMode) ?? null;
}

export async function randomMode(): Promise<CustomModeListItem | null> {
  const modes = await listModes(200);
  if (modes.length === 0) return null;
  return modes[Math.floor(Math.random() * modes.length)];
}

export async function createMode(filter: CustomFilter): Promise<CreateModeResult> {
  const c = getSupabase();
  if (!c) return { ok: false, reason: 'disabled' };
  const canonical = canonicalizeFilter(filter);
  const payload = { filter: canonical, name: modeName(canonical), filter_hash: await filterHash(canonical) };
  const { data, error } = await c.functions.invoke('create-mode', { body: payload });
  if (error) return { ok: false, reason: error.message };
  return data as CreateModeResult;
}

export async function fetchModeCandidates(modeId: string, limit = 175): Promise<ScryfallCard[]> {
  const c = getSupabase();
  if (!c) throw new Error('Card database is not configured.');
  const { data, error } = await c.rpc('get_mode_game_cards', { p_mode_id: modeId, p_count: limit });
  if (error) throw new Error(error.message);
  return ((data ?? []) as GameCardRow[]).map(rowToCard);
}

export async function getBuiltinModes(): Promise<{ all: CustomMode; popular: CustomMode } | null> {
  const c = getSupabase();
  if (!c) return null;
  const { data, error } = await c.from('mode').select('id,name,filter,card_count,slug').in('slug', ['all', 'popular']);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as (CustomMode & { slug: string })[];
  const all = rows.find((r) => r.slug === 'all');
  const popular = rows.find((r) => r.slug === 'popular');
  if (!all || !popular) return null;
  return { all, popular };
}

export async function listSets(): Promise<SetItem[]> {
  const c = getSupabase();
  if (!c) return [];
  const { data, error } = await c.from('card_set')
    .select('code,name,released_at')
    .order('released_at', { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SetItem[];
}

export async function findExistingMode(filter: CustomFilter): Promise<CustomMode | null> {
  const c = getSupabase();
  if (!c) return null;
  const hash = await filterHash(canonicalizeFilter(filter));
  const { data, error } = await c.from('custom_mode')
    .select('id,name,filter,card_count')
    .eq('filter_hash', hash)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CustomMode) ?? null;
}
