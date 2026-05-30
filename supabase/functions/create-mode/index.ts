import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const MIN_CARDS = 100;

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, reason: 'method' }, 405);

  let body: { filter?: unknown; name?: unknown; filter_hash?: unknown };
  try { body = await req.json(); } catch { return json({ ok: false, reason: 'bad-json' }, 400); }
  const filter = body.filter;
  const name = typeof body.name === 'string' ? body.name.slice(0, 120) : null;
  const filterHash = typeof body.filter_hash === 'string' && /^[0-9a-f]{64}$/.test(body.filter_hash) ? body.filter_hash : null;
  if (!filter || typeof filter !== 'object' || !name || !filterHash) return json({ ok: false, reason: 'bad-filter' }, 400);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Dedup: if a mode with this hash exists, return it.
  const existing = await supabase.from('custom_mode').select('id,name,filter,card_count').eq('filter_hash', filterHash).maybeSingle();
  if (existing.data) return json({ ok: true, existed: true, mode: existing.data });

  // Authoritative count (server recomputes; client value is not trusted).
  const counted = await supabase.rpc('count_filtered_cards', { p_filter: filter });
  if (counted.error) return json({ ok: false, reason: 'count' }, 500);
  const cardCount = counted.data as number;
  if (cardCount < MIN_CARDS) return json({ ok: false, reason: 'too-few', count: cardCount }, 400);

  const inserted = await supabase.from('custom_mode')
    .insert({ name, filter, filter_hash: filterHash, card_count: cardCount })
    .select('id,name,filter,card_count').single();
  if (inserted.error) {
    // Lost a race on the unique hash → fetch and return the winner.
    const again = await supabase.from('custom_mode').select('id,name,filter,card_count').eq('filter_hash', filterHash).maybeSingle();
    if (again.data) return json({ ok: true, existed: true, mode: again.data });
    return json({ ok: false, reason: 'insert' }, 500);
  }
  return json({ ok: true, existed: false, mode: inserted.data });
});
