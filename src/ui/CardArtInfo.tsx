import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { scryfallIdFromImageUrl, fetchArtworkInfo, type ArtworkInfo } from '../scryfall/client';
import { useIsMobile } from './useIsMobile';

/**
 * Info pill + fullscreen inspect overlay for a piece of card artwork. Hovering
 * (desktop) or tapping (mobile) the pill reveals the art fullscreen with its
 * name / set / artist. Shared by the game-over background and the start-screen
 * wallpaper. Metadata is lazy-loaded on first open; a missing id just leaves it
 * blank — the art still shows.
 */
export function CardArtInfo({ art, right = 16, top = 'calc(env(safe-area-inset-top) + 12px)', center = false }: { art: string; right?: number; top?: string; center?: boolean }) {
  const mobile = useIsMobile();
  const [inspect, setInspect] = useState(false);
  const [info, setInfo] = useState<ArtworkInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const fetchedRef = useRef(false);

  function loadInfo() {
    if (fetchedRef.current) return;
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
      {/* Info icon — icon only; tap/hover to inspect the card. */}
      <div
        style={{
          position: 'absolute',
          top,
          ...(center ? { left: '50%', transform: 'translateX(-50%)' } : { right }),
          zIndex: 6,
          pointerEvents: 'auto',
        }}
      >
        <button
          type="button"
          data-testid="card-info-pill"
          aria-label="Card info"
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
            justifyContent: 'center',
            width: 34,
            height: 34,
            borderRadius: '50%',
            border: '1px solid rgba(255,255,255,0.22)',
            background: 'rgba(7,6,10,0.45)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            color: 'rgba(255,255,255,0.5)',
            cursor: 'pointer',
            fontFamily: "'Cormorant Garamond', serif",
            fontStyle: 'italic',
            fontSize: 17,
            fontWeight: 600,
            lineHeight: 1,
          }}
        >
          i
        </button>
      </div>

      {inspect && (
        <motion.div
          key="card-art-inspect"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
          data-testid="card-art-inspect"
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
              backgroundImage: `url(${art})`,
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
