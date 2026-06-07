import { useEffect, useState } from 'react';
import { fetchRandomCard } from './client';

/**
 * Fetch one random card's art-crop URL (best-effort). Returns null until it
 * loads, or on failure. Pass `enabled = false` to skip the fetch entirely — e.g.
 * when the caller already supplies the artwork. Shared by the start-screen and
 * game-over backgrounds.
 */
export function useRandomCardArt(enabled = true): string | null {
  const [art, setArt] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetchRandomCard()
      .then((card) => {
        const url = card.image_uris?.art_crop ?? card.card_faces?.[0]?.image_uris?.art_crop ?? null;
        if (!cancelled) setArt(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return art;
}
