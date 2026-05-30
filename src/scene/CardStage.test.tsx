import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CardStage, MOSAIC_COLS, MOSAIC_ROWS } from './CardStage';
import { useGameStore } from '../state/gameStore';
import { DEFAULT_TIME_ATTACK_CONFIG } from '../engine/types';
import type { ScryfallCard } from '../scryfall/types';

const card = (name: string): ScryfallCard => ({
  id: name,
  name,
  cmc: 2,
  type_line: 'Creature',
  power: '2',
  toughness: '2',
  rarity: 'rare',
  image_uris: { normal: 'n.jpg', art_crop: 'a.jpg' },
});

function seedRound(status: 'playing' | 'won' = 'playing') {
  useGameStore.setState({
    round: {
      target: card('Llanowar Elves'),
      options: ['Llanowar Elves', 'Counterspell', 'Shock', 'Doom Blade'],
      startedAt: 0,
      status,
      guess: status === 'won' ? 'Llanowar Elves' : null,
      score: 0,
    },
  });
}

describe('CardStage scanner mode', () => {
  beforeEach(() => seedRound('playing'));

  it('renders the card image and a scan cover, no stage blurs', () => {
    render(<CardStage mode="scanner" stage={0} progress={0.4} angle={30} />);
    expect(screen.getByTestId('card-image')).toBeTruthy();
    expect(screen.getByTestId('scan-cover')).toBeTruthy();
    expect(screen.queryByTestId('blur-type')).toBeNull();
    expect(screen.queryByTestId('blur-text')).toBeNull();
    expect(screen.queryByTestId('blur-mana')).toBeNull();
    expect(screen.queryByTestId('blur-power')).toBeNull();
  });

  it('keeps the name redacted while playing', () => {
    render(<CardStage mode="scanner" stage={0} progress={0.4} angle={30} />);
    expect(screen.getByTestId('blur-name')).toBeTruthy();
  });

  it('redacts the mana cost while manaHidden, then reveals it', () => {
    const { rerender } = render(
      <CardStage mode="scanner" stage={0} progress={0.2} angle={30} manaHidden />,
    );
    expect(screen.getByTestId('blur-mana')).toBeTruthy();
    rerender(<CardStage mode="scanner" stage={0} progress={0.5} angle={30} manaHidden={false} />);
    expect(screen.queryByTestId('blur-mana')).toBeNull();
  });

  it('redacts the rules text while textHidden, then reveals it', () => {
    const { rerender } = render(
      <CardStage mode="scanner" stage={0} progress={0.2} angle={30} textHidden />,
    );
    expect(screen.getByTestId('blur-text')).toBeTruthy();
    rerender(<CardStage mode="scanner" stage={0} progress={0.5} angle={30} textHidden={false} />);
    expect(screen.queryByTestId('blur-text')).toBeNull();
  });

  it('reveals the name and drops the cover when the round is over', () => {
    seedRound('won');
    render(<CardStage mode="scanner" stage={5} progress={1} angle={30} />);
    expect(screen.queryByTestId('blur-name')).toBeNull();
    expect(screen.queryByTestId('scan-cover')).toBeNull();
  });

  it('drops the cover once the sweep completes but keeps the name hidden', () => {
    render(<CardStage mode="scanner" stage={5} progress={1} angle={30} />);
    expect(screen.queryByTestId('scan-cover')).toBeNull();
    expect(screen.getByTestId('blur-name')).toBeTruthy();
  });
});

const IDENTITY = Array.from({ length: 24 }, (_, i) => i);

describe('CardStage mosaic mode', () => {
  beforeEach(() => seedRound('playing'));

  it('grid constants match the engine config (no silent drift)', () => {
    expect(MOSAIC_COLS).toBe(DEFAULT_TIME_ATTACK_CONFIG.mosaicCols);
    expect(MOSAIC_ROWS).toBe(DEFAULT_TIME_ATTACK_CONFIG.mosaicRows);
  });

  it('renders the card image and (tileCount - tilesRevealed) tile covers, no stage blurs', () => {
    render(<CardStage mode="mosaic" stage={0} tileOrder={IDENTITY} tilesRevealed={4} />);
    expect(screen.getByTestId('card-image')).toBeTruthy();
    expect(screen.getAllByTestId('mosaic-tile').length).toBe(20);
    expect(screen.queryByTestId('blur-type')).toBeNull();
    expect(screen.queryByTestId('blur-text')).toBeNull();
    expect(screen.queryByTestId('blur-power')).toBeNull();
  });

  it('keeps the name redacted while playing', () => {
    render(<CardStage mode="mosaic" stage={0} tileOrder={IDENTITY} tilesRevealed={4} />);
    expect(screen.getByTestId('blur-name')).toBeTruthy();
  });

  it('redacts the mana cost while manaHidden, then reveals it', () => {
    const { rerender } = render(
      <CardStage mode="mosaic" stage={0} tileOrder={IDENTITY} tilesRevealed={2} manaHidden />,
    );
    expect(screen.getByTestId('blur-mana')).toBeTruthy();
    rerender(
      <CardStage mode="mosaic" stage={0} tileOrder={IDENTITY} tilesRevealed={6} manaHidden={false} />,
    );
    expect(screen.queryByTestId('blur-mana')).toBeNull();
  });

  it('redacts the rules text while textHidden (name can leak via card text), then reveals it', () => {
    const { rerender } = render(
      <CardStage mode="mosaic" stage={0} tileOrder={IDENTITY} tilesRevealed={2} textHidden />,
    );
    expect(screen.getByTestId('blur-text')).toBeTruthy();
    rerender(
      <CardStage mode="mosaic" stage={0} tileOrder={IDENTITY} tilesRevealed={6} textHidden={false} />,
    );
    expect(screen.queryByTestId('blur-text')).toBeNull();
  });

  it('drops the rules-text redaction when the round is over', () => {
    seedRound('won');
    render(<CardStage mode="mosaic" stage={5} tileOrder={IDENTITY} tilesRevealed={24} textHidden />);
    expect(screen.queryByTestId('blur-text')).toBeNull();
  });

  it('drops all tiles and the name when the round is over', () => {
    seedRound('won');
    render(<CardStage mode="mosaic" stage={5} tileOrder={IDENTITY} tilesRevealed={24} />);
    expect(screen.queryByTestId('mosaic-tile')).toBeNull();
    expect(screen.queryByTestId('blur-name')).toBeNull();
  });
});

describe('CardStage silhouette mode', () => {
  beforeEach(() => seedRound('playing'));

  it('renders a silhouette cover and name redaction, no stage blurs', () => {
    render(<CardStage mode="silhouette" stage={0} progress={0.3} />);
    expect(screen.getByTestId('card-image')).toBeTruthy();
    expect(screen.getByTestId('silhouette-cover')).toBeTruthy();
    expect(screen.getByTestId('blur-name')).toBeTruthy();
    expect(screen.queryByTestId('blur-type')).toBeNull();
  });

  it('drops the cover and name when over', () => {
    seedRound('won');
    render(<CardStage mode="silhouette" stage={5} progress={1} />);
    expect(screen.queryByTestId('silhouette-cover')).toBeNull();
    expect(screen.queryByTestId('blur-name')).toBeNull();
  });
});

describe('CardStage spotlight mode', () => {
  beforeEach(() => seedRound('playing'));

  it('renders a spotlight cover and name redaction', () => {
    render(<CardStage mode="spotlight" stage={0} progress={0.3} spotlightOrigin={{ xPct: 40, yPct: 30 }} />);
    expect(screen.getByTestId('spotlight-cover')).toBeTruthy();
    expect(screen.getByTestId('blur-name')).toBeTruthy();
  });

  it('drops the cover when over', () => {
    seedRound('won');
    render(<CardStage mode="spotlight" stage={5} progress={1} />);
    expect(screen.queryByTestId('spotlight-cover')).toBeNull();
  });
});

describe('CardStage zoom mode', () => {
  beforeEach(() => seedRound('playing'));

  it('renders both image layers and NO redaction overlays while playing', () => {
    render(<CardStage mode="zoom" stage={0} progress={0.2} />);
    expect(screen.getByTestId('zoom-art')).toBeTruthy();
    expect(screen.getByTestId('zoom-card')).toBeTruthy();
    expect(screen.queryByTestId('blur-name')).toBeNull();
    expect(screen.queryByTestId('blur-text')).toBeNull();
    expect(screen.queryByTestId('blur-mana')).toBeNull();
  });

  it('drops the zoom layers and shows the full card when over', () => {
    seedRound('won');
    render(<CardStage mode="zoom" stage={5} progress={1} />);
    expect(screen.queryByTestId('zoom-art')).toBeNull();
    expect(screen.getByTestId('card-image')).toBeTruthy();
  });
});

describe('CardStage blur mode (unchanged)', () => {
  beforeEach(() => seedRound('playing'));

  it('renders stage blurs and no scan cover at an early stage', () => {
    render(<CardStage mode="blur" stage={1} />);
    expect(screen.getByTestId('blur-name')).toBeTruthy();
    expect(screen.getByTestId('blur-type')).toBeTruthy();
    expect(screen.queryByTestId('scan-cover')).toBeNull();
  });
});
