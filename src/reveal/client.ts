import { getSupabase } from '../supabase/client';
import { KNOWN_REVEAL_MODES, type RevealMode } from '../engine/revealMode';

const FALLBACK: RevealMode[] = ['blur', 'scanner', 'mosaic'];

/** Enabled reveal modes from Supabase (ordered), filtered to known modes.
 *  Returns the built-in three on any error or an empty/unknown result. */
export async function fetchEnabledRevealModes(): Promise<RevealMode[]> {
  const c = getSupabase();
  if (!c) return FALLBACK;
  try {
    const { data, error } = await c
      .from('reveal_mode')
      .select('key')
      .eq('enabled', true)
      .order('sort_order');
    if (error || !data) return FALLBACK;
    const known = new Set<string>(KNOWN_REVEAL_MODES);
    const modes = (data as { key: string }[])
      .map((r) => r.key)
      .filter((k): k is RevealMode => known.has(k));
    return modes.length > 0 ? modes : FALLBACK;
  } catch {
    return FALLBACK;
  }
}
