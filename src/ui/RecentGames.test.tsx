import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecentGames } from './RecentGames';
import type { CustomMode } from '../modes/types';

const mode = (id: string): CustomMode => ({ id, name: `Game ${id}`, filter: {}, card_count: 9 });

vi.mock('../modes/recent', async (orig) => ({
  ...(await orig<typeof import('../modes/recent')>()),
  fetchRecentGames: vi.fn(),
}));
vi.mock('../modes/client', () => ({ listModes: vi.fn().mockResolvedValue([]) }));
vi.mock('../cards/client', () => ({ fetchModeTopArt: vi.fn().mockResolvedValue(null) }));
vi.mock('../leaderboard/client', () => ({ fetchModeRuns: vi.fn().mockResolvedValue([]) }));

import { fetchRecentGames } from '../modes/recent';
import { listModes } from '../modes/client';

const mockRecent = fetchRecentGames as ReturnType<typeof vi.fn>;
const mockList = listModes as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue([]);
});

describe('RecentGames', () => {
  it('renders a card per recent game and fires onPick on tap', async () => {
    mockRecent.mockResolvedValue([mode('a'), mode('b')]);
    const onPick = vi.fn();
    render(<RecentGames onPick={onPick} />);
    await waitFor(() => expect(screen.getAllByTestId('game-card')).toHaveLength(2));
    fireEvent.click(screen.getAllByTestId('game-card')[0]);
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('fills up to 4 cards with popular games when recents are few', async () => {
    mockRecent.mockResolvedValue([mode('a')]);
    mockList.mockResolvedValue([mode('a'), mode('x'), mode('y'), mode('z'), mode('w')]);
    render(<RecentGames onPick={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByTestId('game-card')).toHaveLength(4));
  });
});
