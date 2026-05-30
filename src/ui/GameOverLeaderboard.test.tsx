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
    const { container } = render(<GameOverLeaderboard score={5000} correct={10} pool="popular" gameMode="blur" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the projected rank', async () => {
    render(<GameOverLeaderboard score={5000} correct={10} pool="popular" gameMode="blur" />);
    await waitFor(() => expect(screen.getByTestId('projected-rank')).toHaveTextContent('#4'));
  });

  it('shows the online top-5 board on mount', async () => {
    vi.spyOn(client, 'fetchTopScores').mockResolvedValue([
      { id: '1', name: 'Top', score: 999, correct: 9, pool: 'popular', gameMode: 'blur', country: 'DE', createdAt: 0 },
    ]);
    render(<GameOverLeaderboard score={500} correct={5} pool="popular" gameMode="blur" />);
    await waitFor(() => expect(screen.getByTestId('global-list')).toBeInTheDocument());
    expect(screen.getByText('Top')).toBeInTheDocument();
  });

  it('pins the projected position when outside the top five', async () => {
    vi.spyOn(client, 'fetchProjectedRank').mockResolvedValue({ rank: 8, total: 20 });
    vi.spyOn(client, 'fetchTopScores').mockResolvedValue([
      { id: '1', name: 'Top', score: 999, correct: 9, pool: 'popular', gameMode: 'blur', country: 'DE', createdAt: 0 },
    ]);
    render(<GameOverLeaderboard score={500} correct={5} pool="popular" gameMode="blur" />);
    await waitFor(() => expect(screen.getByTestId('global-pinned')).toBeInTheDocument());
  });

  it('renders the name input inside the pinned row when outside the top five', async () => {
    vi.spyOn(client, 'fetchProjectedRank').mockResolvedValue({ rank: 8, total: 20 });
    vi.spyOn(client, 'fetchTopScores').mockResolvedValue([
      { id: '1', name: 'Top', score: 999, correct: 9, pool: 'popular', gameMode: 'blur', country: 'DE', createdAt: 0 },
    ]);
    render(<GameOverLeaderboard score={500} correct={5} pool="popular" gameMode="blur" />);
    const pinned = await screen.findByTestId('global-pinned');
    expect(pinned).toContainElement(screen.getByTestId('name-input'));
  });

  it('flags the name field and does not submit when the name is too short', async () => {
    const submit = vi.spyOn(client, 'submitScore');
    render(<GameOverLeaderboard score={5000} correct={10} pool="popular" gameMode="blur" />);
    await waitFor(() => screen.getByTestId('name-input'));
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'ab' } });
    fireEvent.click(screen.getByTestId('post-btn'));
    expect(screen.getByTestId('name-hint')).toBeInTheDocument();
    expect(screen.getByTestId('name-input')).toHaveAttribute('aria-invalid', 'true');
    expect(submit).not.toHaveBeenCalled();
  });

  it('clears the name hint once the user types a valid name', async () => {
    render(<GameOverLeaderboard score={5000} correct={10} pool="popular" gameMode="blur" />);
    await waitFor(() => screen.getByTestId('name-input'));
    fireEvent.click(screen.getByTestId('post-btn'));
    expect(screen.getByTestId('name-hint')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'Alice' } });
    expect(screen.queryByTestId('name-hint')).toBeNull();
  });

  it('submits and shows a confirmation, persisting the name', async () => {
    vi.spyOn(client, 'submitScore').mockResolvedValue({ ok: true, id: 'x', rank: 4 });
    render(<GameOverLeaderboard score={5000} correct={10} pool="popular" gameMode="blur" />);
    await waitFor(() => screen.getByTestId('name-input'));
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByTestId('post-btn'));
    await waitFor(() => expect(screen.getByTestId('post-confirm')).toBeInTheDocument());
    expect(localStorage.getItem('guessthecard.playername')).toBe('Alice');
    expect(client.submitScore).toHaveBeenCalledWith({ name: 'Alice', score: 5000, correct: 10, pool: 'popular', gameMode: 'blur' });
  });

  it('shows an error message when submission fails', async () => {
    vi.spyOn(client, 'submitScore').mockResolvedValue({ ok: false, reason: 'rate-limited' });
    render(<GameOverLeaderboard score={5000} correct={10} pool="popular" gameMode="blur" />);
    await waitFor(() => screen.getByTestId('name-input'));
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByTestId('post-btn'));
    await waitFor(() => expect(screen.getByTestId('post-error')).toBeInTheDocument());
  });
});
