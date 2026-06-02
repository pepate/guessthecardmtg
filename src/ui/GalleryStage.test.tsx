import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { GalleryStage } from './GalleryStage';
import { useGameStore } from '../state/gameStore';
import type { ScryfallCard } from '../scryfall/types';

const card = (name: string): ScryfallCard => ({
  id: name,
  name,
  cmc: 1,
  type_line: 'Creature',
  image_uris: { art_crop: `https://img/${name}.jpg` },
});

const target = card('Bolt');
const optionCards = [target, card('Aria'), card('Boon'), card('Crux')];

function setRound() {
  useGameStore.setState({
    round: {
      target,
      options: optionCards.map((c) => c.name),
      optionCards,
      startedAt: Date.now(),
      status: 'playing',
      guess: null,
      score: 0,
    },
    gameMode: 'gallery',
    totalScore: 0,
    correctCount: 0,
  });
}

describe('GalleryStage', () => {
  beforeEach(setRound);

  it('shows the target name and a 2×2 grid of four artwork tiles', () => {
    render(<GalleryStage />);
    expect(screen.getByTestId('gallery-name').textContent).toBe('Bolt');
    expect(screen.getAllByTestId('gallery-tile')).toHaveLength(4);
  });

  it('wins the round when the matching artwork is tapped', () => {
    render(<GalleryStage />);
    fireEvent.click(screen.getAllByTestId('gallery-tile')[0]); // target is first
    expect(useGameStore.getState().round?.status).toBe('won');
    expect(useGameStore.getState().totalScore).toBeGreaterThan(0);
  });

  it('loses the round when a wrong artwork is tapped', () => {
    render(<GalleryStage />);
    fireEvent.click(screen.getAllByTestId('gallery-tile')[1]); // a distractor
    expect(useGameStore.getState().round?.status).toBe('lost');
    expect(useGameStore.getState().totalScore).toBe(0);
  });

  it('disables the tiles once the round is resolved (one tap locks it)', () => {
    render(<GalleryStage />);
    const tiles = screen.getAllByTestId('gallery-tile');
    fireEvent.click(tiles[0]);
    for (const tile of screen.getAllByTestId('gallery-tile')) {
      expect(tile).toBeDisabled();
    }
  });
});
