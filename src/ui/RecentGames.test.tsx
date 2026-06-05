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
vi.mock('../leaderboard/identity', () => ({ getUserId: vi.fn().mockResolvedValue(null) }));
vi.mock('../reveal/client', () => ({ fetchEnabledRevealModes: vi.fn().mockResolvedValue(['blur', 'scanner', 'mosaic']) }));

import { fetchRecentGames } from '../modes/recent';
import { listModes } from '../modes/client';
import { fetchModeRuns } from '../leaderboard/client';
import { getUserId } from '../leaderboard/identity';

const mockRecent = fetchRecentGames as ReturnType<typeof vi.fn>;
const mockList = listModes as ReturnType<typeof vi.fn>;
const mockRuns = fetchModeRuns as ReturnType<typeof vi.fn>;
const mockUid = getUserId as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue([]);
  mockRuns.mockResolvedValue([]);
  mockUid.mockResolvedValue(null);
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

  it('lists recents first, then fills with all other modes', async () => {
    mockRecent.mockResolvedValue([mode('a')]);
    mockList.mockResolvedValue([mode('a'), mode('x'), mode('y'), mode('z'), mode('w')]);
    render(<RecentGames onPick={vi.fn()} />);
    // 5 distinct modes, all under the initial 10 → all shown, no Load more.
    await waitFor(() => expect(screen.getAllByTestId('game-card')).toHaveLength(5));
    expect(screen.queryByTestId('games-load-more')).toBeNull();
  });

  it('shows the player rank and games-played badge on a played card', async () => {
    mockRecent.mockResolvedValue([mode('a')]);
    mockUid.mockResolvedValue('me');
    mockRuns.mockResolvedValue([
      { id: 'r1', name: 'Pete', score: 500, correct: 5, gameMode: 'blur', deviceId: 'me', country: null, createdAt: 1 },
      { id: 'r2', name: 'Pete', score: 700, correct: 6, gameMode: 'scanner', deviceId: 'me', country: null, createdAt: 2 },
    ]);
    render(<RecentGames onPick={vi.fn()} />);
    const badge = await screen.findByTestId('card-standing');
    expect(badge.textContent).toContain('#1');
    expect(badge.textContent).toContain('2 games');
    const you = screen.getByTestId('card-you');
    // Summed best-per-reveal = 500 + 700 = 1200; played 2 of 3 enabled reveals.
    expect(you.textContent).toContain('1200');
    expect(you.textContent).toContain('pts');
    expect(you.textContent).toContain('2/3 reveals');
  });

  it('shows 10 cards with a Load more button, then reveals the rest', async () => {
    mockRecent.mockResolvedValue([]);
    mockList.mockResolvedValue(Array.from({ length: 13 }, (_, i) => mode(`m${i}`)));
    render(<RecentGames onPick={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByTestId('game-card')).toHaveLength(10));
    const more = screen.getByTestId('games-load-more');
    expect(more.textContent).toContain('3');
    fireEvent.click(more);
    await waitFor(() => expect(screen.getAllByTestId('game-card')).toHaveLength(13));
    expect(screen.queryByTestId('games-load-more')).toBeNull();
  });
});
