// Dynamic Open-Graph / WhatsApp link preview for the game-end share.
//
// GitHub Pages is static, so per-score OG meta tags can't be served there.
// This edge function returns an HTML document with per-score OG tags (dynamic
// text + a dynamic og-image rendering the score, see the og-image function) and
// redirects real browsers into the game, preserving the ?r=<token> challenge param.
//
// The token scheme is ported verbatim from src/share/score.ts (base64url +
// FNV-1a checksum, SECRET = 'arcane-drift-v1'). Kept standalone — no imports.

const SECRET = 'arcane-drift-v1';
const GAME_URL = 'https://pepate.github.io/guessthecardmtg/';
const OG_IMAGE = 'https://pepate.github.io/guessthecardmtg/og-image.jpeg';
// This project's own Supabase host — used to build the dynamic og-image URL.
const SELF_BASE = 'https://jgapiqpaeaslfpbgiptf.supabase.co';

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

function page(
  description: string,
  redirectUrl: string,
  imageUrl: string,
  imageWidth: number,
  imageHeight: number,
): string {
  const d = esc(description);
  const u = esc(redirectUrl);
  const img = esc(imageUrl);
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
<meta property="og:image:width" content="${imageWidth}">
<meta property="og:image:height" content="${imageHeight}">
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

// Link-preview crawlers (WhatsApp, Facebook, Twitter, …) parse the OG tags from
// the HTML body. Real browsers must instead be redirected straight into the
// game: the Supabase functions domain forces a text/plain content-type on HTML
// responses (anti-phishing), so an in-page meta-refresh/JS redirect never runs
// in a browser. We therefore branch on the User-Agent.
const CRAWLER_RE =
  /whatsapp|facebookexternalhit|facebot|twitterbot|telegrambot|slackbot|discordbot|linkedinbot|pinterest|redditbot|googlebot|bingbot|applebot|embedly|skypeuripreview|whatsapp|bot|crawler|spider|preview|unfurl/i;

Deno.serve((req: Request) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('method not allowed', { status: 405 });
  }

  const rawToken = new URL(req.url).searchParams.get('r');
  const result = decodeResult(rawToken);

  let description: string;
  let redirectUrl: string;
  let imageUrl: string;
  let imageWidth: number;
  let imageHeight: number;
  if (result && rawToken) {
    description = `I scored ${result.score} points (${result.correct} cards) in Arcane Drift — can you beat me?`;
    redirectUrl = `${GAME_URL}?r=${encodeURIComponent(rawToken)}`;
    imageUrl = `${SELF_BASE}/functions/v1/og-image?r=${encodeURIComponent(rawToken)}`;
    imageWidth = 1200;
    imageHeight = 630;
  } else {
    description = 'Guess the Magic: The Gathering card before the clock runs out.';
    redirectUrl = GAME_URL;
    imageUrl = OG_IMAGE;
    imageWidth = 1024;
    imageHeight = 541;
  }

  // Humans get a real HTTP redirect into the game; crawlers get the OG HTML.
  const ua = req.headers.get('user-agent') ?? '';
  if (!CRAWLER_RE.test(ua)) {
    return Response.redirect(redirectUrl, 302);
  }

  return new Response(page(description, redirectUrl, imageUrl, imageWidth, imageHeight), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'Vary': 'User-Agent',
    },
  });
});
