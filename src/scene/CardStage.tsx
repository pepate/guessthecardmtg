import type { CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore } from '../state/gameStore';
import type { RevealStage } from '../engine/types';
import type { ScryfallCard } from '../scryfall/types';

const RARITY_GLOW: Record<string, string> = {
  common: 'rgba(200,200,200,0.20)',
  uncommon: 'rgba(169,196,212,0.35)',
  rare: 'rgba(230,201,106,0.55)',
  mythic: 'rgba(255,106,44,0.70)',
  special: 'rgba(255,106,44,0.70)',
  bonus: 'rgba(255,106,44,0.70)',
};

// Mosaic grid (layout). Must match mosaicCols/mosaicRows in DEFAULT_TIME_ATTACK_CONFIG
// (guarded by an invariant test in CardStage.test.tsx).
export const MOSAIC_COLS = 4;
export const MOSAIC_ROWS = 6;
const MOSAIC_TILES = MOSAIC_COLS * MOSAIC_ROWS;
const MOSAIC_IDENTITY = Array.from({ length: MOSAIC_TILES }, (_, i) => i);

// Zoom mode (layout; tunable). Zooms out from the centre of the artwork: the art-crop
// zoom-in phase runs until ZOOM_CROSSFADE of the reveal, then the full card crossfades in
// from the same origin, scaling from ZOOM_CARD_START (art roughly fills the frame) down to
// 1 so it continues seamlessly. ZOOM_ORIGIN sits over the art centre (top third of the card),
// not the card centre, so the art stays put while the frame grows in around it. Neither layer
// ever scales below 1, and the card layer is fully opaque beneath the fading art, so the dark
// background never bleeds through (no black border). The reveal lands on the whole card with
// only the name left blurred (the name layer scales with the card so it tracks it the whole way).
const ZOOM_START_SCALE = 2.5;
const ZOOM_CARD_START = 2.2;
const ZOOM_CROSSFADE = 0.6;
const ZOOM_ORIGIN = '50% 33%';

const wrapperStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 16px',
  boxSizing: 'border-box',
};

const cardStyle: CSSProperties = {
  position: 'relative',
  aspectRatio: '488 / 680',
  // Fill as much of the screen as possible while leaving room for the HUD on
  // top and the timer + name choices at the bottom. Width is the usual binding
  // constraint on phones, so the height cap is generous.
  height: 'min(66vh, 132vw)',
  maxWidth: '94vw',
  borderRadius: '4.7% / 3.4%',
  overflow: 'hidden',
};

const fillImg: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'fill',
};

const blurBase: CSSProperties = {
  position: 'absolute',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  background: 'rgba(8,6,12,0.30)',
  border: '1px solid rgba(255,186,120,0.10)',
  borderRadius: 4,
};

const maskBase: CSSProperties = {
  position: 'absolute',
  background: '#08060c',
};

function Blur({ testid, style }: { testid: string; style: CSSProperties }) {
  return (
    <motion.div
      data-testid={testid}
      style={{ ...blurBase, ...style }}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    />
  );
}

function Mask({ style }: { style: CSSProperties }) {
  return (
    <motion.div
      style={{ ...maskBase, ...style }}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    />
  );
}

export function CardStage({
  stage,
  wide = false,
  preview = false,
  card,
  over: overProp,
  mode = 'blur',
  progress = 0,
  angle = 0,
  manaHidden = false,
  textHidden = false,
  tileOrder = MOSAIC_IDENTITY,
  tilesRevealed = 0,
  spotlightOrigin = { xPct: 50, yPct: 45 },
}: {
  stage: RevealStage;
  wide?: boolean;
  /** Render at a smaller size for a non-game preview (e.g. the pre-game reveal teaser). */
  preview?: boolean;
  /** Card to render instead of the active game round — used by the reveal preview. */
  card?: ScryfallCard;
  /** Force the revealed/over state. Defaults to the active round's status. */
  over?: boolean;
  mode?: 'blur' | 'scanner' | 'mosaic' | 'zoom' | 'silhouette' | 'spotlight';
  progress?: number;
  angle?: number;
  manaHidden?: boolean;
  textHidden?: boolean;
  tileOrder?: number[];
  tilesRevealed?: number;
  spotlightOrigin?: { xPct: number; yPct: number };
}) {
  const round = useGameStore((s) => s.round);
  const target = card ?? round?.target;
  if (!target) return null;

  // Portrait: card centered, sized to leave room for the bottom-sheet.
  // Wide: card anchored left, width-capped so it never overlaps the side panel.
  // Wide mode: render inline (sized to the card) so it can sit in a centered
  // row directly beside the options column. Portrait: full-bleed centered.
  const wrapper: CSSProperties = preview
    ? { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }
    : wide
      ? { display: 'flex', alignItems: 'center', height: '100%', flex: 'none' }
      : wrapperStyle;
  const cardCss: CSSProperties = preview
    ? { ...cardStyle, height: 'min(42vh, 64vw)', maxWidth: '78vw' }
    : wide
      ? { ...cardStyle, height: 'min(78vh, calc(88vw * 680 / 488))', maxWidth: 'none' }
      : cardStyle;

  const cardUrl =
    target.image_uris?.normal ??
    target.card_faces?.[0]?.image_uris?.normal ??
    '';
  if (!cardUrl) return <div style={wrapper} />;

  const over = overProp ?? (round?.status !== 'playing');
  const hasPower = !!target.power;

  const artUrl =
    target.image_uris?.art_crop ??
    target.card_faces?.[0]?.image_uris?.art_crop ??
    cardUrl;
  const zoomPa = Math.min(1, progress / ZOOM_CROSSFADE);
  const zoomPb = Math.max(0, (progress - ZOOM_CROSSFADE) / (1 - ZOOM_CROSSFADE));
  // Phase 1 (0→crossfade): art_crop zooms out from ZOOM_START_SCALE to 1 (fills the frame).
  // Phase 2 (crossfade→1): the full card scales from ZOOM_CARD_START down to 1 beneath the art,
  // which fades out — the frame grows in around the art. Both scales stay >= 1 so nothing ever
  // shrinks past the frame edge and reveals the dark background.
  const zoomArtScale = 1 + (1 - zoomPa) * (ZOOM_START_SCALE - 1);
  const zoomCardScale = ZOOM_CARD_START - zoomPb * (ZOOM_CARD_START - 1);

  const artOnly = !over && stage === 0;
  const blurName = !over;
  const blurType = !over && stage < 2;
  const blurMana = !over && stage < 3;
  const blurText = !over && stage < 4;
  const blurPower = hasPower && !over && stage < 4;

  const glow = RARITY_GLOW[target.rarity ?? 'common'] ?? RARITY_GLOW.common;

  return (
    <div style={wrapper}>
      <div
        style={{
          ...cardCss,
          boxShadow: `0 18px 40px rgba(0,0,0,0.6), 0 0 ${over ? 48 : 26}px ${glow}`,
          transition: 'box-shadow 0.6s ease',
        }}
      >
        <img
          src={cardUrl}
          alt=""
          data-testid="card-image"
          data-stage={stage}
          data-status={round?.status ?? (over ? 'over' : 'playing')}
          style={{ ...fillImg, opacity: mode === 'zoom' && !over ? 0 : 1 }}
        />

        <AnimatePresence>
          {mode === 'scanner' ? (
            <>
              {!over && progress < 1 && (
                <motion.div
                  key="scan-cover"
                  data-testid="scan-cover"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: `linear-gradient(${angle}deg, transparent ${Math.max(0, progress * 100 - 3)}%, #ffd79a ${progress * 100}%, rgba(255,150,60,0.6) ${progress * 100 + 1}%, #07050a ${progress * 100 + 4}%, #07050a 100%)`,
                  }}
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                />
              )}
              {blurName && (
                <Blur
                  key="name"
                  testid="blur-name"
                  style={{ top: '3.2%', left: '5%', width: '60%', height: '6.5%', zIndex: 2 }}
                />
              )}
              {!over && manaHidden && (
                <Blur
                  key="mana"
                  testid="blur-mana"
                  style={{ top: '3.2%', left: '58%', width: '37%', height: '6.5%', zIndex: 2 }}
                />
              )}
              {!over && textHidden && (
                <Blur
                  key="text"
                  testid="blur-text"
                  style={{ top: '62.5%', left: '5%', width: '90%', height: '26%', zIndex: 2 }}
                />
              )}
            </>
          ) : mode === 'mosaic' ? (
            <>
              {!over &&
                Array.from({ length: MOSAIC_TILES }, (_, t) => {
                  const step = tileOrder.indexOf(t);
                  if (step >= 0 && step < tilesRevealed) return null;
                  const row = Math.floor(t / MOSAIC_COLS);
                  const col = t % MOSAIC_COLS;
                  return (
                    <motion.div
                      key={`tile-${t}`}
                      data-testid="mosaic-tile"
                      data-tile={t}
                      style={{
                        position: 'absolute',
                        top: `${(row / MOSAIC_ROWS) * 100}%`,
                        left: `${(col / MOSAIC_COLS) * 100}%`,
                        // +1px so neighbouring tiles overlap: sub-pixel rounding
                        // otherwise leaves thin gaps that reveal strips of the card.
                        width: `calc(${100 / MOSAIC_COLS}% + 1px)`,
                        height: `calc(${100 / MOSAIC_ROWS}% + 1px)`,
                        backgroundColor: '#08060c',
                      }}
                      initial={{ opacity: 1 }}
                      exit={{
                        backgroundColor: ['#08060c', '#ffd79a', 'rgba(0,0,0,0)'],
                        opacity: [1, 1, 0],
                      }}
                      transition={{ duration: 0.45 }}
                    />
                  );
                })}
              {blurName && (
                <Blur
                  key="name"
                  testid="blur-name"
                  style={{ top: '3.2%', left: '5%', width: '60%', height: '6.5%', zIndex: 2 }}
                />
              )}
              {!over && manaHidden && (
                <Blur
                  key="mana"
                  testid="blur-mana"
                  style={{ top: '3.2%', left: '58%', width: '37%', height: '6.5%', zIndex: 2 }}
                />
              )}
              {!over && textHidden && (
                <Blur
                  key="text"
                  testid="blur-text"
                  style={{ top: '62.5%', left: '5%', width: '90%', height: '26%', zIndex: 2 }}
                />
              )}
            </>
          ) : mode === 'zoom' ? (
            <>
              {!over && (
                <motion.img
                  key="zoom-card"
                  data-testid="zoom-card"
                  src={cardUrl}
                  alt=""
                  style={{ ...fillImg, transform: `scale(${zoomCardScale})`, transformOrigin: ZOOM_ORIGIN }}
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                />
              )}
              {!over && (
                <motion.img
                  key="zoom-art"
                  data-testid="zoom-art"
                  src={artUrl}
                  alt=""
                  style={{ ...fillImg, objectFit: 'cover', transform: `scale(${zoomArtScale})`, transformOrigin: ZOOM_ORIGIN }}
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 1 - zoomPb }}
                  transition={{ duration: 0 }}
                  exit={{ opacity: 0 }}
                />
              )}
              {blurName && (
                <motion.div
                  key="name"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    transform: `scale(${zoomCardScale})`,
                    transformOrigin: ZOOM_ORIGIN,
                    zIndex: 3,
                    pointerEvents: 'none',
                  }}
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                >
                  <div
                    data-testid="blur-name"
                    style={{ ...blurBase, top: '3.2%', left: '5%', width: '60%', height: '6.5%' }}
                  />
                </motion.div>
              )}
            </>
          ) : mode === 'silhouette' ? (
            <>
              {!over && progress < 1 && (
                <motion.div
                  key="silhouette-cover"
                  data-testid="silhouette-cover"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    backdropFilter: `grayscale(${1 - progress}) brightness(${0.08 + progress * 0.92}) contrast(${1 + (1 - progress) * 0.4})`,
                    WebkitBackdropFilter: `grayscale(${1 - progress}) brightness(${0.08 + progress * 0.92}) contrast(${1 + (1 - progress) * 0.4})`,
                    background: `rgba(8,6,12,${Math.max(0, 0.55 * (1 - progress))})`,
                  }}
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                />
              )}
              {blurName && (
                <Blur key="name" testid="blur-name" style={{ top: '3.2%', left: '5%', width: '60%', height: '6.5%', zIndex: 2 }} />
              )}
              {!over && manaHidden && (
                <Blur key="mana" testid="blur-mana" style={{ top: '3.2%', left: '58%', width: '37%', height: '6.5%', zIndex: 2 }} />
              )}
              {!over && textHidden && (
                <Blur key="text" testid="blur-text" style={{ top: '62.5%', left: '5%', width: '90%', height: '26%', zIndex: 2 }} />
              )}
            </>
          ) : mode === 'spotlight' ? (
            <>
              {!over && progress < 1 && (
                <motion.div
                  key="spotlight-cover"
                  data-testid="spotlight-cover"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: `radial-gradient(circle at ${spotlightOrigin.xPct}% ${spotlightOrigin.yPct}%, transparent ${progress * 110}%, rgba(255,150,60,0.25) ${progress * 110 + 4}%, #07050a ${progress * 110 + 10}%)`,
                  }}
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                />
              )}
              {blurName && (
                <Blur key="name" testid="blur-name" style={{ top: '3.2%', left: '5%', width: '60%', height: '6.5%', zIndex: 2 }} />
              )}
              {!over && manaHidden && (
                <Blur key="mana" testid="blur-mana" style={{ top: '3.2%', left: '58%', width: '37%', height: '6.5%', zIndex: 2 }} />
              )}
              {!over && textHidden && (
                <Blur key="text" testid="blur-text" style={{ top: '62.5%', left: '5%', width: '90%', height: '26%', zIndex: 2 }} />
              )}
            </>
          ) : (
            <>
              {artOnly && (
                <>
                  <Mask key="m-top" style={{ top: 0, left: 0, width: '100%', height: '11.5%' }} />
                  <Mask key="m-bottom" style={{ top: '56%', left: 0, width: '100%', height: '44%' }} />
                  <Mask key="m-left" style={{ top: '11.5%', left: 0, width: '7.5%', height: '44.5%' }} />
                  <Mask key="m-right" style={{ top: '11.5%', left: '92.5%', width: '7.5%', height: '44.5%' }} />
                </>
              )}

              {blurName && (
                <Blur key="name" testid="blur-name" style={{ top: '3.2%', left: '5%', width: '60%', height: '6.5%' }} />
              )}
              {blurMana && (
                <Blur key="mana" testid="blur-mana" style={{ top: '3.2%', left: '58%', width: '37%', height: '6.5%' }} />
              )}
              {blurType && (
                <Blur key="type" testid="blur-type" style={{ top: '56.3%', left: '5%', width: '90%', height: '5.5%' }} />
              )}
              {blurText && (
                <Blur key="text" testid="blur-text" style={{ top: '62.5%', left: '5%', width: '90%', height: '26%' }} />
              )}
              {blurPower && (
                <Blur key="power" testid="blur-power" style={{ top: '88%', left: '75%', width: '18%', height: '6.5%' }} />
              )}
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
