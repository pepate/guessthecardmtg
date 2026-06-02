import { useEffect, useRef, useState } from 'react';
import { CardStage } from '../scene/CardStage';
import { fetchCandidates } from '../cards/client';
import type { ScryfallCard } from '../scryfall/types';
import type { CustomFilter } from '../modes/filter';
import type { RevealMode } from '../engine/timeAttack';
import {
  stageAt,
  scanProgressAt,
  scanAngleFor,
  tilesRevealedAt,
  tileOrderFor,
  spotlightOriginFor,
} from '../engine/timeAttack';
import { DEFAULT_TIME_ATTACK_CONFIG as CONFIG } from '../engine/types';

// How many cards to pull for the loop — enough variety without a heavy fetch.
const PREVIEW_CARDS = 24;
// Pause on the (almost) fully revealed card before cycling to the next one.
const HOLD_MS = 900;

/** Real per-mode time to fully reveal — mirrors the in-game pacing so the teaser
 *  shows exactly the effect the player will get. */
function revealMsFor(mode: RevealMode): number {
  if (mode === 'mosaic') return CONFIG.mosaicTileMs * CONFIG.mosaicCols * CONFIG.mosaicRows;
  if (mode === 'blur') return CONFIG.stageMs * 5;
  return CONFIG.scanRevealMs;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Looping, name-redacted preview of a reveal mode: cycles random cards from the
 * mode's pool, playing the real reveal animation for each, until the parent
 * closes the confirm overlay. The card name stays hidden throughout — same as
 * during an actual round — so it never spoils an answer.
 */
export function RevealPreview({
  reveal,
  filter,
  variant = 'mobile',
}: {
  reveal: RevealMode;
  filter: CustomFilter;
  /** 'desktop' renders a smaller card so it fits inside the modal popup. */
  variant?: 'mobile' | 'desktop';
}) {
  const [cards, setCards] = useState<ScryfallCard[]>([]);
  const [index, setIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const filterKey = JSON.stringify(filter);
  const previewHeight = variant === 'desktop' ? 'min(46vh, 320px)' : 'min(42vh, 64vw)';
  const previewMaxWidth = variant === 'desktop' ? '230px' : '78vw';

  useEffect(() => {
    let alive = true;
    fetchCandidates(filter, PREVIEW_CARDS)
      .then((cs) => { if (alive) { setCards(cs); setIndex(0); } })
      .catch(() => { if (alive) setCards([]); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  const indexRef = useRef(0);
  indexRef.current = index;

  useEffect(() => {
    if (cards.length === 0) return;
    const loopMs = revealMsFor(reveal) + HOLD_MS;
    let raf = 0;
    let start = performance.now();
    const tick = (now: number) => {
      const e = now - start;
      if (e >= loopMs) {
        start = now;
        setIndex((i) => (cards.length ? (i + 1) % cards.length : 0));
        setElapsed(0);
      } else {
        setElapsed(e);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cards.length, reveal]);

  const current = cards[index];

  if (!current) {
    return (
      <div style={{ height: previewHeight, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="spinner" />
      </div>
    );
  }

  // Gallery has no per-card reveal — show a 2×2 of artworks (name hidden so it
  // never spoils), cycling the window like the other previews loop cards.
  if (reveal === 'gallery') {
    const tiles = Array.from({ length: 4 }, (_, k) => cards[(index * 4 + k) % cards.length]);
    return (
      <div data-testid="reveal-preview" style={{ width: '100%', maxWidth: 'min(48vh, 72vw)', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ textAlign: 'center', fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, fontSize: 24, color: 'var(--ink-1)' }}>
          ?
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {tiles.map((c, i) => {
            const url = c?.image_uris?.art_crop ?? c?.card_faces?.[0]?.image_uris?.art_crop;
            return (
              <div
                key={c?.id ?? i}
                style={{
                  aspectRatio: '1 / 1',
                  borderRadius: 10,
                  border: '1px solid var(--line-strong)',
                  background: url ? `center / cover no-repeat url(${url})` : 'rgba(20,17,28,0.6)',
                }}
              />
            );
          })}
        </div>
      </div>
    );
  }

  const seed = hashStr(current.id);
  const stage = stageAt(elapsed, CONFIG);
  const progress = scanProgressAt(elapsed, CONFIG);
  const angle = scanAngleFor(seed, 0);
  const manaHidden = elapsed < CONFIG.scanManaRevealMs;
  const textHidden = elapsed < CONFIG.scanManaRevealMs;
  const tileCount = CONFIG.mosaicCols * CONFIG.mosaicRows;
  const tilesRevealed = tilesRevealedAt(elapsed, CONFIG);
  const tileOrder = tileOrderFor(seed, 0, tileCount);
  const spotlightOrigin = spotlightOriginFor(seed, 0);

  return (
    <div data-testid="reveal-preview" style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
      <CardStage
        preview
        previewHeight={previewHeight}
        previewMaxWidth={previewMaxWidth}
        card={current}
        over={false}
        mode={reveal}
        stage={stage}
        progress={progress}
        angle={angle}
        manaHidden={manaHidden}
        textHidden={textHidden}
        tileOrder={tileOrder}
        tilesRevealed={tilesRevealed}
        spotlightOrigin={spotlightOrigin}
      />
    </div>
  );
}
