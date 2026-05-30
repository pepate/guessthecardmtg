import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { fetchRandomCard } from '../cards/client';
import { scryfallIdFromImageUrl, fetchArtworkInfo, type ArtworkInfo } from '../scryfall/client';
import { useIsMobile } from './useIsMobile';

// Shown behind the game-over screen until the random card art loads, so the
// background isn't black during the first Supabase round-trip. Mirrors App.tsx.
const FALLBACK_ART = `${import.meta.env.BASE_URL}og-image.jpeg`;

// The bottom-darkening scrim from StartArtwork's full variant — keeps the lower
// game-over buttons readable over near-solid ink while the art shows up top.
const SCRIM =
  'linear-gradient(180deg, rgba(7,6,10,0.34) 0%, rgba(7,6,10,0.46) 32%, rgba(7,6,10,0.80) 72%, rgba(7,6,10,0.95) 100%)';

/**
 * Full-bleed game-over background: a random card's artwork behind a scrim, plus
 * a top "info" pill. Hovering (desktop) / tapping (mobile) the pill enters an
 * inspect overlay that shows the art fullscreen with its metadata. Artwork is
 * shown immediately; metadata is lazy-loaded and filled in when it arrives.
 */
export function GameOverArtwork() {
  const mobile = useIsMobile();
  const [art, setArt] = useState<string | null>(null);
  const [inspect, setInspect] = useState(false);

  // Lazy metadata state. `null` = not yet requested/available.
  const [info, setInfo] = useState<ArtworkInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const fetchedRef = useRef(false);

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

  // Fetch metadata once the real art URL is known. Best-effort: a throw/null id
  // just leaves the metadata empty — the artwork still shows.
  function loadInfo() {
    if (fetchedRef.current || !art) return;
    const id = scryfallIdFromImageUrl(art);
    if (!id) return;
    fetchedRef.current = true;
    setInfoLoading(true);
    fetchArtworkInfo(id)
      .then(setInfo)
      .catch(() => {})
      .finally(() => setInfoLoading(false));
  }

  function openInspect() {
    loadInfo();
    setInspect(true);
  }

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

      {/* Info pill — interactive, so it sits above the scrim with pointerEvents on. */}
      <div
        style={{
          position: 'absolute',
          top: 'calc(env(safe-area-inset-top) + 64px)',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 6,
          pointerEvents: 'auto',
        }}
      >
        <button
          type="button"
          data-testid="gameover-info-pill"
          aria-label={mobile ? 'Tap for card info' : 'Hover for card info'}
          onClick={() => {
            // Desktop uses hover; tap is the mobile toggle (and a click fallback).
            if (mobile) (inspect ? setInspect(false) : openInspect());
            else openInspect();
          }}
          onMouseEnter={() => {
            if (!mobile) openInspect();
          }}
          onMouseLeave={() => {
            if (!mobile) setInspect(false);
          }}
          onFocus={() => {
            if (!mobile) openInspect();
          }}
          onBlur={() => {
            if (!mobile) setInspect(false);
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 13px',
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.18)',
            background: 'rgba(7,6,10,0.55)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            color: 'var(--ink-2)',
            cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}
        >
          <span
            aria-hidden
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 16,
              height: 16,
              borderRadius: '50%',
              border: '1px solid currentColor',
              fontSize: 10,
              fontStyle: 'italic',
              fontFamily: "'Cormorant Garamond', serif",
              lineHeight: 1,
            }}
          >
            i
          </span>
          {mobile ? 'Tap for card info' : 'Hover for card info'}
        </button>
      </div>

      {inspect && (
        <motion.div
          key="gameover-inspect"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
          data-testid="gameover-inspect"
          // Tap anywhere (mainly mobile) dismisses; on desktop the pill's
          // mouseleave handles it, but a click here is a harmless fallback.
          onClick={() => setInspect(false)}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 5,
            pointerEvents: 'auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-end',
          }}
        >
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `url(${bg})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
          {/* Very light scrim only at the very bottom, so the metadata stays legible. */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(180deg, rgba(7,6,10,0) 55%, rgba(7,6,10,0.72) 100%)',
            }}
          />
          <div
            style={{
              position: 'relative',
              zIndex: 1,
              textAlign: 'center',
              padding: '0 24px calc(40px + env(safe-area-inset-bottom))',
              maxWidth: 560,
            }}
          >
            <div
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 32,
                fontWeight: 600,
                color: 'var(--ink-0)',
                lineHeight: 1.15,
                textShadow: '0 2px 12px rgba(0,0,0,0.7)',
              }}
            >
              {info ? info.name || '—' : infoLoading ? '…' : '…'}
            </div>
            <div
              style={{
                marginTop: 8,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 12,
                letterSpacing: 2,
                textTransform: 'uppercase',
                color: 'var(--ink-1)',
                textShadow: '0 1px 8px rgba(0,0,0,0.7)',
              }}
            >
              {info && (info.setName || info.year)
                ? [info.setName, info.year].filter(Boolean).join(' · ')
                : '…'}
            </div>
            <div
              style={{
                marginTop: 6,
                fontFamily: "'Cormorant Garamond', serif",
                fontStyle: 'italic',
                fontSize: 15,
                color: 'var(--ink-2)',
                textShadow: '0 1px 8px rgba(0,0,0,0.7)',
              }}
            >
              {info && info.artist ? `Illustrated by ${info.artist}` : '…'}
            </div>
          </div>
        </motion.div>
      )}
    </>
  );
}
