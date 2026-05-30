import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { StartLeaderboard } from './StartLeaderboard';
import * as client from '../leaderboard/client';

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  vi.spyOn(client, 'fetchTopScores').mockResolvedValue([]);
});

describe('StartLeaderboard', () => {
  it('renders the leaderboard inline with its tabs', async () => {
    render(<StartLeaderboard />);
    expect(screen.getByTestId('start-leaderboard')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('tablist')).toBeInTheDocument());
  });
});
