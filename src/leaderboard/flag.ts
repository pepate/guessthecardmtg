const A = 0x1f1e6; // regional indicator 'A'

/** Render an ISO 3166-1 alpha-2 code as a flag emoji. Empty string if invalid. */
export function countryToFlag(code: string | null): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return '';
  const up = code.toUpperCase();
  return String.fromCodePoint(
    A + (up.charCodeAt(0) - 65),
    A + (up.charCodeAt(1) - 65),
  );
}
