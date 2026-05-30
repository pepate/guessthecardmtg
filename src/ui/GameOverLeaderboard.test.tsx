import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GameOverLeaderboard } from './GameOverLeaderboard';
import * as client from '../leaderboard/client';

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  vi.spyOn(client, 'isLeaderboardEnabled').mockReturnValue(true);
  vi.spyOn(client, 'fetchProjectedRank').mockResolvedValue({ rank: 4, total: 20 });
  vi.spyOn(client, 'fetchTopScores').mockResolvedValue([]);
});

describe('GameOverLeaderboard', () => {
  it('renders nothing when the leaderboard is disabled', () => {
    vi.spyOn(client, 'isLeaderboardEnabled').mockReturnValue(true).mockReturnValue(false);
    const { container } = render(<GameOverLeaderboard score={5000} correct={10} pool="popular" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the projected rank', async () => {
    render(<GameOverLeaderboard score={5000} correct={10} pool="popular" />);
    await waitFor(() => expect(screen.getByTestId('projected-rank')).toHaveTextContent('#4'));
  });

  it('disables the post button when the name is too short', async () => {
    render(<GameOverLeaderboard score={5000} correct={10} pool="popular" />);
    await waitFor(() => screen.getByTestId('name-input'));
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'ab' } });
    expect(screen.getByTestId('post-btn')).toBeDisabled();
  });

  it('submits and shows a confirmation, persisting the name', async () => {
    vi.spyOn(client, 'submitScore').mockResolvedValue({ ok: true, id: 'x', rank: 4 });
    render(<GameOverLeaderboard score={5000} correct={10} pool="popular" />);
    await waitFor(() => screen.getByTestId('name-input'));
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByTestId('post-btn'));
    await waitFor(() => expect(screen.getByTestId('post-confirm')).toBeInTheDocument());
    expect(localStorage.getItem('guessthecard.playername')).toBe('Alice');
    expect(client.submitScore).toHaveBeenCalledWith({ name: 'Alice', score: 5000, correct: 10, pool: 'popular' });
  });

  it('shows an error message when submission fails', async () => {
    vi.spyOn(client, 'submitScore').mockResolvedValue({ ok: false, reason: 'rate-limited' });
    render(<GameOverLeaderboard score={5000} correct={10} pool="popular" />);
    await waitFor(() => screen.getByTestId('name-input'));
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByTestId('post-btn'));
    await waitFor(() => expect(screen.getByTestId('post-error')).toBeInTheDocument());
  });
});
