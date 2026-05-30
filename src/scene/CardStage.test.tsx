import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CardStage } from './CardStage';
import { useGameStore } from '../state/gameStore';
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

describe('CardStage blur mode (unchanged)', () => {
  beforeEach(() => seedRound('playing'));

  it('renders stage blurs and no scan cover at an early stage', () => {
    render(<CardStage mode="blur" stage={1} />);
    expect(screen.getByTestId('blur-name')).toBeTruthy();
    expect(screen.getByTestId('blur-type')).toBeTruthy();
    expect(screen.queryByTestId('scan-cover')).toBeNull();
  });
});
