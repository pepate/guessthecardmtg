import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StartLeaderboard } from './StartLeaderboard';
import * as client from '../leaderboard/client';

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  vi.spyOn(client, 'fetchTopScores').mockResolvedValue([]);
});

describe('StartLeaderboard', () => {
  it('opens the overlay when the button is clicked', async () => {
    render(<StartLeaderboard />);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('open-leaderboard'));
    await waitFor(() => expect(screen.getByRole('tablist')).toBeInTheDocument());
  });

  it('closes the overlay with the close button', async () => {
    render(<StartLeaderboard />);
    fireEvent.click(screen.getByTestId('open-leaderboard'));
    await waitFor(() => expect(screen.getByRole('tablist')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('close-leaderboard'));
    await waitFor(() => expect(screen.queryByRole('tablist')).not.toBeInTheDocument());
  });
});
