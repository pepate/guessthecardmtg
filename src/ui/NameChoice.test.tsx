import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NameChoice } from './NameChoice';
import { useGameStore } from '../state/gameStore';
import type { ScryfallCard } from '../scryfall/types';

const card = (name: string): ScryfallCard => ({
  id: name,
  name,
  cmc: 1,
  type_line: 'Instant',
  image_uris: { normal: 'n.jpg', art_crop: 'a.jpg' },
});

function seedRound() {
  useGameStore.setState({
    round: {
      target: card('Lightning Bolt'),
      options: ['Lightning Bolt', 'Counterspell', 'Llanowar Elves', 'Shock'],
      startedAt: 0,
      status: 'playing',
      guess: null,
      score: 0,
    },
  });
}

describe('NameChoice', () => {
  beforeEach(() => seedRound());

  it('renders all four options in grid layout (default)', () => {
    const { container } = render(<NameChoice />);
    expect(screen.getAllByTestId('name-option')).toHaveLength(4);
    const grid = container.firstChild as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe('1fr 1fr');
  });

  it('renders a single column in column layout', () => {
    const { container } = render(<NameChoice layout="column" />);
    expect(screen.getAllByTestId('name-option')).toHaveLength(4);
    const grid = container.firstChild as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe('1fr');
  });
});
