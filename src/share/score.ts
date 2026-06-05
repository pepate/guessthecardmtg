import type { PoolKind } from '../state/highscores';

export interface SharedResult {
  score: number;
  correct: number;
  pool: PoolKind;
}

// Embedded signing key. This is shipped in the client bundle, so the scheme only
// deters casual tampering (editing ?r= or hand-crafting a token) — it is not a
// cryptographic guarantee. That trade-off is acceptable for a fun, no-stakes game.
const SECRET = 'arcane-drift-v1';

function base64urlEncode(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
}

// FNV-1a, 32-bit. Cheap, stable across runtimes, good enough as a tamper check.
function checksum(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function encodeResult(result: SharedResult): string {
  const payload = base64urlEncode(
    JSON.stringify([result.score, result.correct, result.pool === 'all' ? 1 : 0]),
  );
  return `${payload}.${checksum(payload + SECRET)}`;
}

export function decodeResult(token: string | null | undefined): SharedResult | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (checksum(payload + SECRET) !== sig) return null;
  try {
    const arr: unknown = JSON.parse(base64urlDecode(payload));
    if (!Array.isArray(arr) || arr.length !== 3) return null;
    const [score, correct, poolFlag] = arr;
    if (typeof score !== 'number' || typeof correct !== 'number') return null;
    if (score < 0 || correct < 0) return null;
    return { score, correct, pool: poolFlag === 1 ? 'all' : 'popular' };
  } catch {
    return null;
  }
}

export function shareUrl(result: SharedResult): string {
  return `${location.origin}${import.meta.env.BASE_URL}?r=${encodeResult(result)}`;
}

// ── Mode share ──────────────────────────────────────────────────────────────
// A signed token for sharing a whole mode (not a single game result). The link
// opens the mode's picker page and the preview shows the sharer's standing total.
// Same signing scheme; a leading 'm' tags the payload so it can't be confused
// with the 3-tuple score token above.

export interface ModeShare {
  modeId: string;
  modeName: string;
  /** The sharer's standing total in this mode — shown in the link preview. */
  score: number;
}

export function encodeModeShare(s: ModeShare): string {
  const payload = base64urlEncode(JSON.stringify(['m', s.modeId, s.modeName, s.score]));
  return `${payload}.${checksum(payload + SECRET)}`;
}

export function decodeModeShare(token: string | null | undefined): ModeShare | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (checksum(payload + SECRET) !== sig) return null;
  try {
    const arr: unknown = JSON.parse(base64urlDecode(payload));
    if (!Array.isArray(arr) || arr.length !== 4 || arr[0] !== 'm') return null;
    const [, modeId, modeName, score] = arr;
    if (typeof modeId !== 'string' || typeof modeName !== 'string' || typeof score !== 'number') return null;
    if (score < 0) return null;
    return { modeId, modeName, score };
  } catch {
    return null;
  }
}

// Prefer the Supabase edge function (dynamic OG preview) when configured;
// otherwise fall back to a plain mode link the app opens directly.
export function modeShareLink(s: ModeShare): string {
  const base = import.meta.env.VITE_SUPABASE_URL;
  if (!base) return `${location.origin}${import.meta.env.BASE_URL}?m=${encodeURIComponent(s.modeId)}`;
  return `${base.replace(/\/$/, '')}/functions/v1/share?r=${encodeModeShare(s)}`;
}

// Prefer the Supabase edge function (dynamic OG preview) when configured;
// otherwise fall back to the plain game URL.
export function shareLink(result: SharedResult): string {
  const base = import.meta.env.VITE_SUPABASE_URL;
  if (!base) return shareUrl(result);
  return `${base.replace(/\/$/, '')}/functions/v1/share?r=${encodeResult(result)}`;
}
