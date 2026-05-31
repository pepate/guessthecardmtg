import { KNOWN_REVEAL_MODES, type RevealMode } from '../engine/timeAttack';

export interface Deeplink {
  modeId: string;
  reveal: RevealMode;
}

/** A shareable URL that opens straight into a specific mode + reveal mode. */
export function buildDeeplink(modeId: string, reveal: RevealMode): string {
  const u = new URL(window.location.href);
  u.search = '';
  u.searchParams.set('m', modeId);
  u.searchParams.set('r', reveal);
  return u.toString();
}

/** Parse `?m=<uuid>&r=<reveal>`; null when absent or malformed. */
export function parseDeeplink(search: string): Deeplink | null {
  const p = new URLSearchParams(search);
  const m = p.get('m');
  const r = p.get('r');
  if (!m || !/^[0-9a-f-]{36}$/.test(m)) return null;
  if (!r || !KNOWN_REVEAL_MODES.includes(r as RevealMode)) return null;
  return { modeId: m, reveal: r as RevealMode };
}
