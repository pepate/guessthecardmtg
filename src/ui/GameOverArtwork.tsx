import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { fetchRandomCard } from '../cards/client';
import { CardArtInfo } from './CardArtInfo';

// Shown behind the game-over screen until the random card art loads, so the
// background isn't black during the first Supabase round-trip. Mirrors App.tsx.
const FALLBACK_ART = `${import.meta.env.BASE_URL}og-image.jpeg`;

// The bottom-darkening scrim from StartArtwork's full variant — keeps the lower
// game-over buttons readable over near-solid ink while the art shows up top.
const SCRIM =
  'linear-gradient(180deg, rgba(7,6,10,0.34) 0%, rgba(7,6,10,0.46) 32%, rgba(7,6,10,0.80) 72%, rgba(7,6,10,0.95) 100%)';

/**
 * Full-bleed game-over background: a random card's artwork behind a scrim, plus
 * a top "info" pill that reveals the art fullscreen with its metadata.
 */
export function GameOverArtwork() {
  const [art, setArt] = useState<string | null>(null);

  useEffect(() => {
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
  }, []);

  const bg = art ?? FALLBACK_ART;

  return (
    <>
      <motion.div
        key="gameover-art"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 1.2 }}
        aria-hidden
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${bg})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div style={{ position: 'absolute', inset: 0, background: SCRIM }} />
      </motion.div>

      {/* Left of the 40px account icon (anchored at right:12). */}
      <CardArtInfo art={bg} right={60} />
    </>
  );
}
