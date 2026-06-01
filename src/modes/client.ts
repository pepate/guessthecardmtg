import { getSupabase } from '../supabase/client';
import { canonicalizeFilter, filterHash, modeName, type CustomFilter } from './filter';
import type { CreateModeResult, CustomMode, CustomModeListItem } from './types';

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
  const { data, error } = await c.from('mode_list')
    .select('id,name,filter,card_count,entry_count,kind')
    .in('kind', ['custom', 'set'])
    .order('entry_count', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as CustomModeListItem[];
}

export async function randomMode(): Promise<CustomModeListItem | null> {
  const modes = await listModes(200);
  if (modes.length === 0) return null;
  return modes[Math.floor(Math.random() * modes.length)];
}

export async function createMode(filter: CustomFilter, name?: string): Promise<CreateModeResult> {
  const c = getSupabase();
  if (!c) return { ok: false, reason: 'disabled' };
  const canonical = canonicalizeFilter(filter);
  const chosen = name?.trim();
  const payload = {
    filter: canonical,
    name: chosen && chosen.length > 0 ? chosen : modeName(canonical),
    filter_hash: await filterHash(canonical),
  };
  const { data, error } = await c.functions.invoke('create-mode', { body: payload });
  if (error) return { ok: false, reason: error.message };
  return data as CreateModeResult;
}

export async function getBuiltinModes(): Promise<{ all: CustomMode; popular: CustomMode } | null> {
  const c = getSupabase();
  if (!c) return null;
  const { data, error } = await c.from('mode').select('id,name,filter,card_count,slug').in('slug', ['all', 'popular']);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as CustomMode[];
  const all = rows.find((r) => r.slug === 'all');
  const popular = rows.find((r) => r.slug === 'popular');
  if (!all || !popular) return null;
  return { all, popular };
}

export async function getModeById(id: string): Promise<CustomMode | null> {
  const c = getSupabase();
  if (!c) return null;
  const { data, error } = await c.from('mode').select('id,name,filter,card_count,slug').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CustomMode) ?? null;
}

export async function findExistingMode(filter: CustomFilter): Promise<CustomMode | null> {
  const c = getSupabase();
  if (!c) return null;
  const hash = await filterHash(canonicalizeFilter(filter));
  const { data, error } = await c.from('mode')
    .select('id,name,filter,card_count')
    .eq('filter_hash', hash)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CustomMode) ?? null;
}
