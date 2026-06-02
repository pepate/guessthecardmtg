import { motion } from 'framer-motion';
import { useGameStore } from '../state/gameStore';
import type { ScryfallCard } from '../scryfall/types';

type TileState = 'idle' | 'correct' | 'wrong' | 'dim';

function art(card: ScryfallCard): string | undefined {
  return card.image_uris?.art_crop ?? card.card_faces?.[0]?.image_uris?.art_crop;
}

function overlayFor(state: TileState): React.CSSProperties {
  switch (state) {
    case 'correct':
      return { border: '3px solid rgba(120,230,150,0.95)', boxShadow: '0 0 22px rgba(70,200,110,0.5)' };
    case 'wrong':
      return { border: '3px solid rgba(230,110,110,0.95)', boxShadow: '0 0 22px rgba(200,60,60,0.45)' };
    case 'dim':
      return { border: '1px solid var(--line)', opacity: 0.4 };
    default:
      return { border: '1px solid var(--line-strong)' };
  }
}

/**
 * Gallery reveal mode: shows the target card's name and a 2×2 grid of card
 * artworks. The player taps the artwork that matches the name. One tap locks the
 * round (scoring handled by the store, same as the name-guessing modes).
 */
export function GalleryStage() {
  const round = useGameStore((s) => s.round);
  const guessName = useGameStore((s) => s.guessName);

  if (!round || !round.optionCards) return null;
  const resolved = round.status !== 'playing';

  return (
    <motion.div
      key="gallery"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      data-testid="gallery-stage"
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: '8px 16px calc(16px + env(safe-area-inset-bottom))',
        pointerEvents: 'all',
      }}
    >
      <h2
        data-testid="gallery-name"
        style={{
          margin: 0,
          textAlign: 'center',
          fontFamily: "'Cormorant Garamond', serif",
          fontWeight: 700,
          fontSize: 'clamp(24px, 6vw, 34px)',
          color: 'var(--ink-0)',
          lineHeight: 1.15,
          textShadow: '0 2px 14px rgba(0,0,0,0.6)',
        }}
      >
        {round.target.name}
      </h2>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          width: '100%',
          maxWidth: 'min(92vw, 560px)',
        }}
      >
        {round.optionCards.map((card) => {
          let state: TileState = 'idle';
          if (resolved) {
            if (card.name === round.target.name) state = 'correct';
            else if (card.name === round.guess) state = 'wrong';
            else state = 'dim';
          }
          const url = art(card);
          return (
            <button
              key={card.id}
              type="button"
              data-testid="gallery-tile"
              data-state={state}
              disabled={resolved}
              aria-label={resolved && state === 'correct' ? `${card.name} (correct)` : 'Card artwork'}
              onClick={() => guessName(card.name)}
              style={{
                position: 'relative',
                aspectRatio: '1 / 1',
                borderRadius: 12,
                overflow: 'hidden',
                padding: 0,
                cursor: resolved ? 'default' : 'pointer',
                background: url
                  ? `center / cover no-repeat url(${url})`
                  : 'rgba(20,17,28,0.6)',
                transition: 'border-color 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease',
                ...overlayFor(state),
              }}
            />
          );
        })}
      </div>
    </motion.div>
  );
}
