import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Leaderboard } from './Leaderboard';
import * as client from '../leaderboard/client';
import type { GlobalEntry } from '../leaderboard/types';

const entry: GlobalEntry = { id: '1', name: 'Al', score: 900, correct: 9, pool: 'all', country: 'DE', createdAt: 0 };

const manyEntries = (n: number): GlobalEntry[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `e${i}`,
    name: `P${i}`,
    score: 1000 - i,
    correct: 9,
    pool: 'all',
    country: 'DE',
    createdAt: 0,
  }));

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('Leaderboard', () => {
  it('shows the global all-cards tab by default', async () => {
    const spy = vi.spyOn(client, 'fetchTopScores').mockResolvedValue([entry]);
    render(<Leaderboard />);
    await waitFor(() => expect(screen.getByText('Al')).toBeInTheDocument());
    expect(spy).toHaveBeenCalledWith('all', 11, expect.any(Number));
  });

  it('hides the Show more button when there are 10 or fewer entries', async () => {
    vi.spyOn(client, 'fetchTopScores').mockResolvedValue(manyEntries(10));
    render(<Leaderboard />);
    await waitFor(() => expect(screen.getByText('P0')).toBeInTheDocument());
    expect(screen.queryByTestId('leaderboard-expand')).not.toBeInTheDocument();
  });

  it('shows the Show more button only when there are more than 10 entries', async () => {
    vi.spyOn(client, 'fetchTopScores').mockResolvedValue(manyEntries(11));
    render(<Leaderboard />);
    await waitFor(() => expect(screen.getByTestId('leaderboard-expand')).toBeInTheDocument());
  });

  it('switches to the Me tab and shows the local store', async () => {
    vi.spyOn(client, 'fetchTopScores').mockResolvedValue([]);
    localStorage.setItem(
      'guessthecard.highscores.v3',
      JSON.stringify([{ score: 500, correct: 5, date: 1, pool: 'all' }]),
    );
    render(<Leaderboard />);
    fireEvent.click(screen.getByRole('tab', { name: /^me$/i }));
    await waitFor(() => expect(screen.getByTestId('highscore-list')).toBeInTheDocument());
  });

  it('hides Popular and Me tabs when they have no data', async () => {
    vi.spyOn(client, 'fetchTopScores').mockImplementation(async (pool) => (pool === 'all' ? [entry] : []));
    render(<Leaderboard />);
    await waitFor(() => expect(screen.getByText('Al')).toBeInTheDocument());
    expect(screen.getByRole('tab', { name: /all cards/i })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /popular/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /^me$/i })).not.toBeInTheDocument();
  });

  it('shows the Popular tab once it has data', async () => {
    vi.spyOn(client, 'fetchTopScores').mockResolvedValue([entry]);
    render(<Leaderboard />);
    await waitFor(() => expect(screen.getByRole('tab', { name: /popular/i })).toBeInTheDocument());
  });

  it('expands a global tab to the top 100', async () => {
    const spy = vi.spyOn(client, 'fetchTopScores').mockResolvedValue(manyEntries(11));
    render(<Leaderboard />);
    await waitFor(() => expect(screen.getByTestId('leaderboard-expand')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('leaderboard-expand'));
    await waitFor(() => expect(spy).toHaveBeenCalledWith('all', 100, expect.any(Number)));
  });

  it('shows window sub-tabs with Today selected by default', async () => {
    vi.spyOn(client, 'fetchTopScores').mockResolvedValue([entry]);
    render(<Leaderboard />);
    await waitFor(() => expect(screen.getByText('Al')).toBeInTheDocument());
    expect(screen.getByRole('tab', { name: /today/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /weekly/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /all-time/i })).toBeInTheDocument();
  });

  it('selecting All-time queries with a null since', async () => {
    const spy = vi.spyOn(client, 'fetchTopScores').mockResolvedValue([entry]);
    render(<Leaderboard />);
    await waitFor(() => expect(screen.getByText('Al')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: /all-time/i }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith('all', 11, null));
  });

  it('shows a spinner while loading before rows arrive', async () => {
    let resolve!: (v: GlobalEntry[]) => void;
    vi.spyOn(client, 'fetchTopScores').mockReturnValue(
      new Promise<GlobalEntry[]>((r) => {
        resolve = r;
      }),
    );
    render(<Leaderboard />);
    expect(screen.getAllByTestId('leaderboard-spinner').length).toBeGreaterThanOrEqual(1);
    resolve([entry]);
    await waitFor(() => expect(screen.getByText('Al')).toBeInTheDocument());
  });

  it('hides the window sub-tabs on the Me tab', async () => {
    vi.spyOn(client, 'fetchTopScores').mockResolvedValue([]);
    localStorage.setItem(
      'guessthecard.highscores.v3',
      JSON.stringify([{ score: 500, correct: 5, date: 1, pool: 'all' }]),
    );
    render(<Leaderboard />);
    fireEvent.click(screen.getByRole('tab', { name: /^me$/i }));
    await waitFor(() => expect(screen.getByTestId('highscore-list')).toBeInTheDocument());
    expect(screen.queryByRole('tab', { name: /today/i })).not.toBeInTheDocument();
  });
});
