import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { ScryfallCard } from '../scryfall/types';
import { useGameStore } from '../state/gameStore';

const card = (name: string): ScryfallCard => ({
  id: name,
  name,
  cmc: 2,
  type_line: 'Creature',
  power: '2',
  toughness: '2',
  rarity: 'rare',
  image_uris: { normal: `${name}.jpg`, art_crop: `${name}-art.jpg` },
});

const fetchCandidates = vi.fn();
vi.mock('../cards/client', () => ({ fetchCandidates: (...a: unknown[]) => fetchCandidates(...a) }));

// Import after the mock is registered.
const { RevealPreview } = await import('./RevealPreview');

describe('RevealPreview', () => {
  beforeEach(() => {
    // No active game round — the preview must render off its own `card` prop.
    useGameStore.setState({ round: null });
    fetchCandidates.mockReset();
  });

  it('renders a fetched card with the mode reveal overlay, without a game round', async () => {
    fetchCandidates.mockResolvedValue([card('Llanowar Elves'), card('Counterspell')]);
    render(<RevealPreview reveal="silhouette" filter={{}} />);

    await waitFor(() => expect(screen.getByTestId('card-image')).toBeTruthy());
    expect(screen.getByTestId('reveal-preview')).toBeTruthy();
    expect(screen.getByTestId('silhouette-cover')).toBeTruthy();
    // Name stays redacted in the teaser — same as during a real round.
    expect(screen.getByTestId('blur-name')).toBeTruthy();
  });

  it('shows a spinner until cards arrive', async () => {
    let resolve!: (c: ScryfallCard[]) => void;
    fetchCandidates.mockReturnValue(new Promise<ScryfallCard[]>((r) => { resolve = r; }));
    const { container } = render(<RevealPreview reveal="mosaic" filter={{}} />);

    expect(container.querySelector('.spinner')).toBeTruthy();
    resolve([card('Shock')]);
    await waitFor(() => expect(screen.getByTestId('card-image')).toBeTruthy());
  });

  it('requests cards for the given filter', async () => {
    fetchCandidates.mockResolvedValue([card('Doom Blade')]);
    const filter = { colors: { match: 'all', values: ['G', 'U'] } };
    render(<RevealPreview reveal="scanner" filter={filter} />);
    await waitFor(() => expect(fetchCandidates).toHaveBeenCalled());
    expect(fetchCandidates.mock.calls[0][0]).toEqual(filter);
  });
});
