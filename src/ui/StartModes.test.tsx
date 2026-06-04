import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StartModes } from './StartModes';

// Stub the heavy children so the test focuses on the tab switch.
vi.mock('./DailySet', () => ({ DailySet: () => <div data-testid="daily-set" /> }));
vi.mock('./RecentGames', () => ({ RecentGames: () => <div data-testid="recent-games" /> }));
vi.mock('../modes/client', () => ({ listModes: vi.fn().mockResolvedValue([]) }));
vi.mock('../leaderboard/client', () => ({ fetchModeRuns: vi.fn().mockResolvedValue([]) }));
vi.mock('../daily/client', () => ({ fetchDailyToday: vi.fn().mockResolvedValue(null) }));
vi.mock('../leaderboard/identity', () => ({ getUserId: vi.fn().mockResolvedValue('') }));
vi.mock('../profile/client', () => ({ getProfile: vi.fn().mockResolvedValue(null) }));
vi.mock('../state/highscores', () => ({ getGamesPlayed: () => 1 }));
vi.mock('../modes/quickStart', () => ({ startMostPlayedGame: vi.fn(), startRandomGame: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

describe('StartModes tabs', () => {
  it('defaults to the Games tab and switches to Leaderboard', async () => {
    render(<StartModes onPick={vi.fn()} onCreate={vi.fn()} onNeedAccount={vi.fn()} />);
    expect(screen.getByTestId('daily-set')).toBeInTheDocument();
    expect(screen.getByTestId('recent-games')).toBeInTheDocument();
    expect(screen.queryByTestId('mode-list')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tab-leaderboard'));
    await waitFor(() => expect(screen.getByTestId('mode-list')).toBeInTheDocument());
    expect(screen.queryByTestId('recent-games')).not.toBeInTheDocument();
  });
});
