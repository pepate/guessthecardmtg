import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Leaderboard } from './Leaderboard';
import * as client from '../leaderboard/client';
import type { GlobalEntry } from '../leaderboard/types';

const entry: GlobalEntry = { id: '1', name: 'Al', score: 900, correct: 9, pool: 'all', country: 'DE', createdAt: 0 };

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('Leaderboard', () => {
  it('shows the global all-cards tab by default', async () => {
    const spy = vi.spyOn(client, 'fetchTopScores').mockResolvedValue([entry]);
    render(<Leaderboard />);
    await waitFor(() => expect(screen.getByText('Al')).toBeInTheDocument());
    expect(spy).toHaveBeenCalledWith('all', 5);
  });

  it('switches to the Me tab and shows the local store', async () => {
    vi.spyOn(client, 'fetchTopScores').mockResolvedValue([]);
    localStorage.setItem(
      'guessthecard.highscores.v3',
      JSON.stringify([{ score: 500, correct: 5, date: 1, pool: 'all' }]),
    );
    render(<Leaderboard />);
    fireEvent.click(screen.getByRole('tab', { name: /me/i }));
    await waitFor(() => expect(screen.getByTestId('highscore-list')).toBeInTheDocument());
  });

  it('expands a global tab to the top 100', async () => {
    const spy = vi.spyOn(client, 'fetchTopScores').mockResolvedValue([entry]);
    render(<Leaderboard />);
    await waitFor(() => expect(screen.getByText('Al')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('leaderboard-expand'));
    await waitFor(() => expect(spy).toHaveBeenCalledWith('all', 100));
  });
});
