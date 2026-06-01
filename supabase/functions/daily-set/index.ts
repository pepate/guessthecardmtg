import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const MIN_CARDS = 50;

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function berlinToday(): string {
  // en-CA → YYYY-MM-DD; timeZone gives the Berlin calendar day.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

type DailyRow = { day: string; mode_id: string; reveal: string };

async function rowToResult(
  supabase: ReturnType<typeof createClient>,
  row: DailyRow,
): Promise<Record<string, unknown>> {
  const mode = await supabase.from('mode').select('name,filter').eq('id', row.mode_id).maybeSingle();
  const filter = (mode.data?.filter ?? {}) as { sets?: string[] };
  return {
    ok: true,
    day: row.day,
    modeId: row.mode_id,
    reveal: row.reveal,
    setCode: filter.sets?.[0] ?? null,
    setName: mode.data?.name ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, reason: 'method' }, 405);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const day = berlinToday();

  // Already created today → return it.
  const existing = await supabase.from('daily_set').select('day,mode_id,reveal').eq('day', day).maybeSingle();
  if (existing.data) return json(await rowToResult(supabase, existing.data as DailyRow));

  // Pick a random unplayed eligible set (set_list mode_id null ⇒ no {sets:[code]} mode yet).
  const list = await supabase.rpc('set_list');
  if (list.error) return json({ ok: false, reason: 'set-list' }, 500);
  const rows = (list.data ?? []) as { code: string; name: string; mode_id: string | null; eligible_count: number }[];
  let pool = rows.filter((r) => r.mode_id === null && r.eligible_count >= MIN_CARDS);
  if (pool.length === 0) pool = rows.filter((r) => r.eligible_count >= MIN_CARDS); // fallback: allow a repeat
  if (pool.length === 0) return json({ ok: false, reason: 'no-set' }, 500);
  const pick = pool[Math.floor(Math.random() * pool.length)];

  // Create (or reuse) the set-mode for this set.
  const filter = { sets: [pick.code] };
  const filterHash = await sha256Hex(JSON.stringify(filter));
  let modeId: string;
  const existMode = await supabase.from('mode').select('id').eq('filter_hash', filterHash).maybeSingle();
  if (existMode.data) {
    modeId = existMode.data.id as string;
  } else {
    const counted = await supabase.rpc('count_filtered_cards', { p_filter: filter });
    if (counted.error) return json({ ok: false, reason: 'count' }, 500);
    const inserted = await supabase.from('mode')
      .insert({ name: pick.name, filter, filter_hash: filterHash, card_count: counted.data as number, kind: 'set' })
      .select('id').single();
    if (inserted.error) {
      const again = await supabase.from('mode').select('id').eq('filter_hash', filterHash).maybeSingle();
      if (!again.data) return json({ ok: false, reason: 'mode-insert' }, 500);
      modeId = again.data.id as string;
    } else {
      modeId = inserted.data.id as string;
    }
  }

  // Random enabled reveal.
  const reveals = await supabase.from('reveal_mode').select('key').eq('enabled', true);
  const keys = ((reveals.data ?? []) as { key: string }[]).map((r) => r.key);
  if (keys.length === 0) return json({ ok: false, reason: 'no-reveal' }, 500);
  const reveal = keys[Math.floor(Math.random() * keys.length)];

  // Claim the day (race-safe). Whoever wins the unique(day) defines it.
  await supabase.from('daily_set').insert({ day, mode_id: modeId, reveal }).select('day').maybeSingle();
  const final = await supabase.from('daily_set').select('day,mode_id,reveal').eq('day', day).maybeSingle();
  if (!final.data) return json({ ok: false, reason: 'claim' }, 500);
  return json(await rowToResult(supabase, final.data as DailyRow));
});
