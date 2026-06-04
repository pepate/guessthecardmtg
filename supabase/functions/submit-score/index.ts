import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const NAME_MIN = 3;
const NAME_MAX = 16;
const MAX_CORRECT = 40;
const MAX_CARDS = 200; // generous upper bound on cards faced in one game
const MIN_PER_CARD = 100;
const MAX_PER_CARD = 1000;
const RATE_MAX = 5;
const RATE_WINDOW_MS = 60_000;
const BANNED = ['fuck', 'shit', 'nigger', 'cunt', 'bitch', 'asshole'];
const VALID_GAME_MODES = ['blur', 'scanner', 'mosaic', 'zoom', 'silhouette', 'spotlight', 'gallery'] as const;

function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[ -]/g, '').replace(/\s+/g, ' ').trim();
  const capped = cleaned.slice(0, NAME_MAX).trim();
  return capped.length >= NAME_MIN ? capped : null;
}

function validCards(cards: unknown, correct: number): boolean {
  if (typeof cards !== 'number' || !Number.isInteger(cards)) return false;
  return cards >= correct && cards <= MAX_CARDS;
}

function validScore(score: unknown, correct: unknown): boolean {
  if (typeof score !== 'number' || typeof correct !== 'number') return false;
  if (!Number.isInteger(score) || !Number.isInteger(correct)) return false;
  if (correct < 0 || correct > MAX_CORRECT) return false;
  if (correct === 0) return score === 0;
  return score >= correct * MIN_PER_CARD && score <= correct * MAX_PER_CARD;
}

function isClean(name: string): boolean {
  const low = name.toLowerCase();
  return !BANNED.some((w) => low.includes(w));
}

async function lookupCountry(ip: string): Promise<string | null> {
  try {
    const res = await fetch(`https://ipwho.is/${ip}?fields=country_code`);
    if (!res.ok) return null;
    const j = await res.json();
    const code = j?.country_code;
    return typeof code === 'string' && /^[A-Z]{2}$/.test(code) ? code : null;
  } catch {
    return null;
  }
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, reason: 'method' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, reason: 'bad-json' }, 400);
  }

  const rawModeId = body.mode_id;
  if (typeof rawModeId !== 'string' || !/^[0-9a-f-]{36}$/.test(rawModeId)) return json({ ok: false, reason: 'mode' }, 400);
  const modeId = rawModeId;

  const name = sanitizeName(body.name);
  if (!name) return json({ ok: false, reason: 'name' }, 400);
  if (!isClean(name)) return json({ ok: false, reason: 'name-blocked' }, 400);

  if (!validScore(body.score, body.correct)) return json({ ok: false, reason: 'score' }, 400);
  const score = body.score as number;
  const correct = body.correct as number;

  const cards = body.cards;
  if (!validCards(cards, correct)) return json({ ok: false, reason: 'cards' }, 400);

  // game_mode is optional — null when absent or unrecognised
  const rawGameMode = body.game_mode;
  const gameMode: string | null =
    typeof rawGameMode === 'string' && (VALID_GAME_MODES as readonly string[]).includes(rawGameMode)
      ? rawGameMode
      : null;

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim();
  const { data: userData } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (!user) return json({ ok: false, reason: 'auth' }, 401);
  const deviceId = user.id; // server-authoritative identity; not spoofable

  // Rate-limit by the authenticated user (no IP is stored anymore).
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const recent = await supabase
    .from('leaderboard')
    .select('id', { count: 'exact', head: true })
    .eq('device_id', deviceId)
    .gte('created_at', since);
  if ((recent.count ?? 0) >= RATE_MAX) return json({ ok: false, reason: 'rate-limited' }, 429);

  const m = await supabase.from('mode').select('id', { head: true, count: 'exact' }).eq('id', modeId);
  if ((m.count ?? 0) === 0) return json({ ok: false, reason: 'mode-not-found' }, 400);

  const country = await lookupCountry(ip);

  const bump = await supabase.rpc('bump_profile_stats', {
    p_user: deviceId,
    p_name: name,
    p_correct: correct,
    p_cards: cards as number,
    p_country: country,
  });
  if (bump.error) {
    // Another player already owns this display name (unique_violation). Reject
    // before writing any leaderboard row so the board never carries a duplicate.
    const code = (bump.error as { code?: string }).code;
    if (code === '23505' || /display_name_taken|duplicate key/i.test(bump.error.message ?? '')) {
      return json({ ok: false, reason: 'name-taken' }, 200);
    }
    return json({ ok: false, reason: 'profile' }, 200);
  }

  // One row per (mode_id, game_mode, device_id): keep this device's best run in
  // each reveal mode. Boards are per (mode, reveal_mode); the display name is
  // whatever the device last submitted.
  let existingQ = supabase
    .from('leaderboard')
    .select('id,score')
    .eq('mode_id', modeId)
    .eq('device_id', deviceId);
  existingQ = gameMode === null ? existingQ.is('game_mode', null) : existingQ.eq('game_mode', gameMode);
  const existing = await existingQ.order('score', { ascending: false }).limit(1).maybeSingle();

  let rowId: string;
  if (!existing.data) {
    const inserted = await supabase
      .from('leaderboard')
      .insert({ score, correct, mode_id: modeId, game_mode: gameMode, device_id: deviceId })
      .select('id')
      .single();
    if (inserted.error) return json({ ok: false, reason: 'insert' }, 500);
    rowId = inserted.data.id;
  } else if (score > existing.data.score) {
    const updated = await supabase
      .from('leaderboard')
      .update({ score, correct, created_at: new Date().toISOString() })
      .eq('id', existing.data.id)
      .select('id')
      .single();
    if (updated.error) return json({ ok: false, reason: 'insert' }, 500);
    rowId = updated.data.id;
  } else {
    // The stored run is already at least this good — leave it as the player's best.
    rowId = existing.data.id;
  }

  // Rank by distinct device (each device's best score for this mode), not raw rows.
  const all = await supabase.from('leaderboard').select('device_id,score').eq('mode_id', modeId);
  const bestByDevice = new Map<string, number>();
  for (const r of (all.data ?? []) as { device_id: string; score: number }[]) {
    const prev = bestByDevice.get(r.device_id);
    if (prev === undefined || r.score > prev) bestByDevice.set(r.device_id, r.score);
  }
  const myBest = bestByDevice.get(deviceId) ?? score;
  let higher = 0;
  for (const [otherDevice, otherScore] of bestByDevice) {
    if (otherDevice !== deviceId && otherScore > myBest) higher++;
  }

  return json({ ok: true, id: rowId, rank: higher + 1 }, 200);
});
