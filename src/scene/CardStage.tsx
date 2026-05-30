import type { CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore } from '../state/gameStore';
import type { RevealStage } from '../engine/types';

const RARITY_GLOW: Record<string, string> = {
  common: 'rgba(200,200,200,0.20)',
  uncommon: 'rgba(169,196,212,0.35)',
  rare: 'rgba(230,201,106,0.55)',
  mythic: 'rgba(255,106,44,0.70)',
  special: 'rgba(255,106,44,0.70)',
  bonus: 'rgba(255,106,44,0.70)',
};

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

export function CardStage({ stage, wide = false }: { stage: RevealStage; wide?: boolean }) {
  const round = useGameStore((s) => s.round);
  if (!round) return null;

  // Portrait: card centered, sized to leave room for the bottom-sheet.
  // Wide: card anchored left, width-capped so it never overlaps the side panel.
  // Wide mode: render inline (sized to the card) so it can sit in a centered
  // row directly beside the options column. Portrait: full-bleed centered.
  const wrapper: CSSProperties = wide
    ? { display: 'flex', alignItems: 'center', height: '100%', flex: 'none' }
    : wrapperStyle;
  const card: CSSProperties = wide
    ? { ...cardStyle, height: 'min(78vh, calc(88vw * 680 / 488))', maxWidth: 'none' }
    : cardStyle;

  const cardUrl =
    round.target.image_uris?.normal ??
    round.target.card_faces?.[0]?.image_uris?.normal ??
    '';
  if (!cardUrl) return <div style={wrapper} />;

  const over = round.status !== 'playing';
  const hasPower = !!round.target.power;

  const artOnly = !over && stage === 0;
  const blurName = !over;
  const blurType = !over && stage < 2;
  const blurMana = !over && stage < 3;
  const blurText = !over && stage < 4;
  const blurPower = hasPower && !over && stage < 4;

  const glow = RARITY_GLOW[round.target.rarity ?? 'common'] ?? RARITY_GLOW.common;

  return (
    <div style={wrapper}>
      <div
        style={{
          ...card,
          boxShadow: `0 18px 40px rgba(0,0,0,0.6), 0 0 ${over ? 48 : 26}px ${glow}`,
          transition: 'box-shadow 0.6s ease',
        }}
      >
        <img
          src={cardUrl}
          alt=""
          data-testid="card-image"
          data-stage={stage}
          data-status={round.status}
          style={fillImg}
        />

        <AnimatePresence>
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
        </AnimatePresence>
      </div>
    </div>
  );
}
