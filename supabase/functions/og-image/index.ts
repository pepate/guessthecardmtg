// Dynamic 1200x630 PNG Open-Graph image for the game-end share — renders the
// player's SCORE and CARD COUNT directly into the brand banner so WhatsApp/
// Twitter previews show the result, not just text. Built with og_edge
// (Supabase's satori + resvg port, ships a default font).
//
// The token scheme is ported verbatim from share/index.ts (base64url + FNV-1a
// checksum, SECRET = 'arcane-drift-v1'). Kept standalone — no shared imports.

import { ImageResponse } from 'https://deno.land/x/og_edge/mod.ts';
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts';

const SECRET = 'arcane-drift-v1';
const BANNER_URL = 'https://pepate.github.io/guessthecardmtg/og-image.jpeg';

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

// Module-scope: fetch the banner once and inline it as a data URI so satori can
// embed it without a network round-trip per render. Empty string on failure.
let BANNER_DATA_URI = '';
try {
  const resp = await fetch(BANNER_URL);
  if (resp.ok) {
    const bytes = new Uint8Array(await resp.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    BANNER_DATA_URI = `data:image/jpeg;base64,${btoa(binary)}`;
  }
} catch {
  BANNER_DATA_URI = '';
}

// Group integer with thousands separators: 22156 -> "22,156".
function formatScore(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// deno-lint-ignore no-explicit-any
type SatoriNode = { type: string; props: Record<string, any> };

function buildElement(result: DecodedResult | null): SatoriNode {
  const hasResult = result != null;
  const scoreText = hasResult ? formatScore(result!.score) : '';
  const sublineText = hasResult ? `${result!.correct} cards correct` : 'Guess the card';

  const children: SatoriNode[] = [];

  // Background banner (only if we managed to inline it).
  if (BANNER_DATA_URI) {
    children.push({
      type: 'img',
      props: {
        src: BANNER_DATA_URI,
        width: 1200,
        height: 630,
        style: {
          position: 'absolute',
          top: 0,
          left: 0,
          width: 1200,
          height: 630,
        },
      },
    });
  }

  // Legibility overlay — dark gradient rising from the bottom.
  children.push({
    type: 'div',
    props: {
      style: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: 1200,
        height: 630,
        display: 'flex',
        backgroundImage:
          'linear-gradient(to top, rgba(7,6,10,0.92) 0%, rgba(7,6,10,0.55) 45%, rgba(7,6,10,0.15) 100%)',
      },
    },
  });

  // Content column at the bottom-left.
  const contentChildren: SatoriNode[] = [
    // Kicker.
    {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          marginBottom: 18,
          fontSize: 30,
          letterSpacing: 6,
          textTransform: 'uppercase',
          color: '#b9b2c7',
        },
        children: 'Arcane Drift',
      },
    },
  ];

  if (hasResult) {
    // Score row: big number + " pts".
    contentChildren.push({
      type: 'div',
      props: {
        style: {
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'flex-end',
          marginBottom: 12,
        },
        children: [
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                fontSize: 150,
                fontWeight: 700,
                lineHeight: 1,
                color: '#ff6a2b',
              },
              children: scoreText,
            },
          },
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                fontSize: 48,
                alignSelf: 'flex-end',
                marginLeft: 16,
                marginBottom: 10,
                color: '#ece7f2',
              },
              children: 'pts',
            },
          },
        ],
      },
    });
  }

  // Subline.
  contentChildren.push({
    type: 'div',
    props: {
      style: {
        display: 'flex',
        fontSize: 44,
        color: '#ece7f2',
      },
      children: sublineText,
    },
  });

  children.push({
    type: 'div',
    props: {
      style: {
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        padding: 64,
      },
      children: contentChildren,
    },
  });

  return {
    type: 'div',
    props: {
      style: {
        position: 'relative',
        width: 1200,
        height: 630,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        backgroundColor: '#07060a',
      },
      children,
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET') {
    return new Response('method not allowed', { status: 405 });
  }

  const rawToken = new URL(req.url).searchParams.get('r');
  const result = decodeResult(rawToken);

  // og_edge only emits PNG; a 1200x630 PNG of photographic art is ~780KB, which
  // WhatsApp may refuse to render as a large preview. Re-encode to JPEG (~120KB)
  // at full resolution so the preview stays crisp and within size limits.
  const png = new Uint8Array(
    await new ImageResponse(buildElement(result), { width: 1200, height: 630 }).arrayBuffer(),
  );
  const decoded = await Image.decode(png);
  const jpeg = await decoded.encodeJPEG(82);

  return new Response(jpeg, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
    },
  });
});
