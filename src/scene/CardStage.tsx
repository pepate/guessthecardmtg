import type { CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore } from '../state/gameStore';
import { cardHasAttribute } from '../engine/attributes';

const ART_CLIP = 'inset(11.5% 7.5% 44% 7.5%)';

const overlayBase: CSSProperties = {
  position: 'absolute',
  backdropFilter: 'blur(7px)',
  WebkitBackdropFilter: 'blur(7px)',
  background: 'rgba(8,10,20,0.35)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 4,
};

const wrapperStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  paddingTop: 72,
  boxSizing: 'border-box',
};

const cardStyle: CSSProperties = {
  position: 'relative',
  aspectRatio: '488 / 680',
  height: 'min(58vh, 70vw)',
  maxWidth: '88vw',
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

function Overlay({ testid, style }: { testid: string; style: CSSProperties }) {
  return (
    <motion.div
      data-testid={testid}
      style={{ ...overlayBase, ...style }}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    />
  );
}

export function CardStage() {
  const round = useGameStore((s) => s.round);
  if (!round) return null;

  const cardUrl =
    round.target.image_uris?.normal ??
    round.target.card_faces?.[0]?.image_uris?.normal ??
    '';
  if (!cardUrl) return <div style={wrapperStyle} />;

  const over = round.status !== 'playing';
  const colorRevealed = round.reveals.color || over;
  const showMana = !(round.reveals.cmc || over);
  const showType = !(round.reveals.type || over);
  const isCreature = cardHasAttribute(round.target, 'power');
  const showPower = isCreature && !(round.reveals.power || over);

  return (
    <div style={wrapperStyle}>
      <div style={cardStyle}>
        <img
          src={cardUrl}
          alt=""
          data-testid="card-image"
          data-color-revealed={colorRevealed}
          style={{
            ...fillImg,
            filter: colorRevealed ? 'none' : 'grayscale(1)',
            transition: 'filter 0.5s ease',
          }}
        />
        {!colorRevealed && (
          <img src={cardUrl} alt="" aria-hidden style={{ ...fillImg, clipPath: ART_CLIP }} />
        )}
        <AnimatePresence>
          {showMana && (
            <Overlay
              key="mana"
              testid="blur-mana"
              style={{ top: '3.8%', left: '58%', width: '37%', height: '5%' }}
            />
          )}
          {showType && (
            <Overlay
              key="type"
              testid="blur-type"
              style={{ top: '56.5%', left: '6%', width: '88%', height: '5%' }}
            />
          )}
          {showPower && (
            <Overlay
              key="power"
              testid="blur-power"
              style={{ top: '88.5%', left: '76%', width: '17%', height: '6%' }}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
