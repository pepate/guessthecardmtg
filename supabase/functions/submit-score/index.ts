import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const NAME_MIN = 3;
const NAME_MAX = 16;
const MAX_CORRECT = 40;
const MIN_PER_CARD = 100;
const MAX_PER_CARD = 1000;
const RATE_MAX = 5;
const RATE_WINDOW_MS = 60_000;
const BANNED = ['fuck', 'shit', 'nigger', 'cunt', 'bitch', 'asshole'];
const VALID_GAME_MODES = ['blur', 'scanner', 'mosaic', 'zoom', 'silhouette', 'spotlight'] as const;

function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[ -]/g, '').replace(/\s+/g, ' ').trim();
  const capped = cleaned.slice(0, NAME_MAX).trim();
  return capped.length >= NAME_MIN ? capped : null;
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

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
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

  // game_mode is optional — null when absent or unrecognised
  const rawGameMode = body.game_mode;
  const gameMode: string | null =
    typeof rawGameMode === 'string' && (VALID_GAME_MODES as readonly string[]).includes(rawGameMode)
      ? rawGameMode
      : null;

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  const salt = Deno.env.get('IP_HASH_SALT') ?? '';
  const ipHash = await sha256(ip + salt);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const recent = await supabase
    .from('leaderboard')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('created_at', since);
  if ((recent.count ?? 0) >= RATE_MAX) return json({ ok: false, reason: 'rate-limited' }, 429);

  const m = await supabase.from('mode').select('id', { head: true, count: 'exact' }).eq('id', modeId);
  if ((m.count ?? 0) === 0) return json({ ok: false, reason: 'mode-not-found' }, 400);

  const country = await lookupCountry(ip);

  const inserted = await supabase
    .from('leaderboard')
    .insert({ name, score, correct, mode_id: modeId, game_mode: gameMode, country, ip_hash: ipHash })
    .select('id')
    .single();
  if (inserted.error) return json({ ok: false, reason: 'insert' }, 500);

  const higher = await supabase
    .from('leaderboard')
    .select('id', { count: 'exact', head: true })
    .gt('score', score)
    .eq('mode_id', modeId);
  const rank = (higher.count ?? 0) + 1;

  return json({ ok: true, id: inserted.data.id, rank }, 200);
});
