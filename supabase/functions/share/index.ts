// Dynamic Open-Graph / WhatsApp link preview for the game-end share.
//
// GitHub Pages is static, so per-score OG meta tags can't be served there.
// This edge function returns an HTML document with per-score OG tags (dynamic
// TEXT + a fixed brand banner image) and redirects real browsers into the game,
// preserving the ?r=<token> challenge param.
//
// The token scheme is ported verbatim from src/share/score.ts (base64url +
// FNV-1a checksum, SECRET = 'arcane-drift-v1'). Kept standalone — no imports.

const SECRET = 'arcane-drift-v1';
const GAME_URL = 'https://pepate.github.io/guessthecardmtg/';
const OG_IMAGE = 'https://pepate.github.io/guessthecardmtg/og-image.jpeg';

function base64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
}

// FNV-1a, 32-bit. Identical constants to the client.
function checksum(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

interface DecodedResult {
  score: number;
  correct: number;
  pool: 'all' | 'popular';
}

function decodeResult(token: string | null | undefined): DecodedResult | null {
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

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function page(description: string, redirectUrl: string): string {
  const d = esc(description);
  const u = esc(redirectUrl);
  const img = esc(OG_IMAGE);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Arcane Drift</title>
<meta property="og:type" content="website">
<meta property="og:title" content="Arcane Drift">
<meta property="og:description" content="${d}">
<meta property="og:url" content="${u}">
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1024">
<meta property="og:image:height" content="541">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Arcane Drift">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${img}">
<meta http-equiv="refresh" content="0; url=${u}">
</head>
<body>
<p>Redirecting to Arcane Drift… <a href="${u}">Continue</a></p>
<script>location.replace(${JSON.stringify(redirectUrl)})</script>
</body>
</html>`;
}

Deno.serve((req: Request) => {
  if (req.method !== 'GET') {
    return new Response('method not allowed', { status: 405 });
  }

  const rawToken = new URL(req.url).searchParams.get('r');
  const result = decodeResult(rawToken);

  let description: string;
  let redirectUrl: string;
  if (result && rawToken) {
    description = `I scored ${result.score} points (${result.correct} cards) in Arcane Drift — can you beat me?`;
    redirectUrl = `${GAME_URL}?r=${encodeURIComponent(rawToken)}`;
  } else {
    description = 'Guess the Magic: The Gathering card before the clock runs out.';
    redirectUrl = GAME_URL;
  }

  return new Response(page(description, redirectUrl), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
});
