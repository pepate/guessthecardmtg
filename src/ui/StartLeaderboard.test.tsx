import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { StartLeaderboard } from './StartLeaderboard';
import * as client from '../leaderboard/client';
import * as modesClient from '../modes/client';

const builtins = {
  all: { id: 'all-mode-uuid', name: 'All Cards', filter: {}, card_count: 1000 },
  popular: { id: 'pop-mode-uuid', name: 'Popular', filter: { popular: true }, card_count: 500 },
};

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  vi.spyOn(modesClient, 'getBuiltinModes').mockResolvedValue(builtins);
  vi.spyOn(client, 'fetchModeTopScores').mockResolvedValue([]);
});

describe('StartLeaderboard', () => {
  it('renders the leaderboard inline with its tabs', async () => {
    render(<StartLeaderboard />);
    expect(screen.getByTestId('start-leaderboard')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('tablist').length).toBeGreaterThanOrEqual(1));
  });
});
