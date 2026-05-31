import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GameOverLeaderboard } from './GameOverLeaderboard';
import * as client from '../leaderboard/client';
import * as modes from '../modes/client';
import * as identity from '../leaderboard/identity';
import type { CustomFilter } from '../modes/filter';

const MODE_ID = 'mode-uuid';

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  vi.spyOn(client, 'isLeaderboardEnabled').mockReturnValue(true);
  vi.spyOn(client, 'fetchModeProjectedRank').mockResolvedValue({ rank: 4, total: 20 });
  vi.spyOn(client, 'fetchModeTopScores').mockResolvedValue([]);
  vi.spyOn(identity, 'getUserId').mockResolvedValue(null);
});

describe('GameOverLeaderboard', () => {
  it('renders nothing when the leaderboard is disabled', () => {
    vi.spyOn(client, 'isLeaderboardEnabled').mockReturnValue(false);
    const { container } = render(<GameOverLeaderboard score={5000} correct={10} cards={10} modeId={MODE_ID} gameMode="blur" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the projected rank', async () => {
    render(<GameOverLeaderboard score={5000} correct={10} cards={10} modeId={MODE_ID} gameMode="blur" />);
    await waitFor(() => expect(screen.getByTestId('projected-rank')).toHaveTextContent('#4'));
  });

  it('shows the online top-5 board on mount', async () => {
    vi.spyOn(client, 'fetchModeTopScores').mockResolvedValue([
      { id: '1', name: 'Top', score: 999, correct: 9, gameModes: ['blur'], country: 'DE', createdAt: 0, deviceId: 'dev-top' },
    ]);
    render(<GameOverLeaderboard score={500} correct={5} cards={5} modeId={MODE_ID} gameMode="blur" />);
    await waitFor(() => expect(screen.getByTestId('global-list')).toBeInTheDocument());
    expect(screen.getByText('Top')).toBeInTheDocument();
  });

  it('pins the projected position when outside the top five', async () => {
    vi.spyOn(client, 'fetchModeProjectedRank').mockResolvedValue({ rank: 8, total: 20 });
    vi.spyOn(client, 'fetchModeTopScores').mockResolvedValue([
      { id: '1', name: 'Top', score: 999, correct: 9, gameModes: ['blur'], country: 'DE', createdAt: 0, deviceId: 'dev-top' },
    ]);
    render(<GameOverLeaderboard score={500} correct={5} cards={5} modeId={MODE_ID} gameMode="blur" />);
    await waitFor(() => expect(screen.getByTestId('global-pinned')).toBeInTheDocument());
  });

  it('renders the name input inside the pinned row when outside the top five', async () => {
    vi.spyOn(client, 'fetchModeProjectedRank').mockResolvedValue({ rank: 8, total: 20 });
    vi.spyOn(client, 'fetchModeTopScores').mockResolvedValue([
      { id: '1', name: 'Top', score: 999, correct: 9, gameModes: ['blur'], country: 'DE', createdAt: 0, deviceId: 'dev-top' },
    ]);
    render(<GameOverLeaderboard score={500} correct={5} cards={5} modeId={MODE_ID} gameMode="blur" />);
    const pinned = await screen.findByTestId('global-pinned');
    expect(pinned).toContainElement(screen.getByTestId('name-input'));
  });

  it('flags the name field and does not submit when the name is too short', async () => {
    const submit = vi.spyOn(client, 'submitScore');
    render(<GameOverLeaderboard score={5000} correct={10} cards={10} modeId={MODE_ID} gameMode="blur" />);
    await waitFor(() => screen.getByTestId('name-input'));
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'ab' } });
    fireEvent.click(screen.getByTestId('post-btn'));
    expect(screen.getByTestId('name-hint')).toBeInTheDocument();
    expect(screen.getByTestId('name-input')).toHaveAttribute('aria-invalid', 'true');
    expect(submit).not.toHaveBeenCalled();
  });

  it('clears the name hint once the user types a valid name', async () => {
    render(<GameOverLeaderboard score={5000} correct={10} cards={10} modeId={MODE_ID} gameMode="blur" />);
    await waitFor(() => screen.getByTestId('name-input'));
    fireEvent.click(screen.getByTestId('post-btn'));
    expect(screen.getByTestId('name-hint')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'Alice' } });
    expect(screen.queryByTestId('name-hint')).toBeNull();
  });

  it('submits with modeId+gameMode and shows a confirmation, persisting the name', async () => {
    vi.spyOn(client, 'submitScore').mockResolvedValue({ ok: true, id: 'x', rank: 4 });
    render(<GameOverLeaderboard score={5000} correct={10} cards={10} modeId={MODE_ID} gameMode="blur" />);
    await waitFor(() => screen.getByTestId('name-input'));
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByTestId('post-btn'));
    await waitFor(() => expect(screen.getByTestId('post-confirm')).toBeInTheDocument());
    expect(localStorage.getItem('guessthecard.playername')).toBe('Alice');
    expect(client.submitScore).toHaveBeenCalledWith({ name: 'Alice', score: 5000, correct: 10, cards: 10, modeId: MODE_ID, gameMode: 'blur' });
  });

  it('shows an error message when submission fails', async () => {
    vi.spyOn(client, 'submitScore').mockResolvedValue({ ok: false, reason: 'rate-limited' });
    render(<GameOverLeaderboard score={5000} correct={10} cards={10} modeId={MODE_ID} gameMode="blur" />);
    await waitFor(() => screen.getByTestId('name-input'));
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByTestId('post-btn'));
    await waitFor(() => expect(screen.getByTestId('post-error')).toBeInTheDocument());
  });
});

describe('GameOverLeaderboard lazy set-mode creation', () => {
  const SET_FILTER: CustomFilter = { sets: ['dom'] };
  const NEW_MODE = { id: 'new-mode-id', name: 'DOM', filter: SET_FILTER, card_count: 60 };
  const EXISTING_MODE = { id: 'existing-mode-id', name: 'DOM', filter: SET_FILTER, card_count: 60 };

  async function typeAndPost(name = 'Alice') {
    await waitFor(() => screen.getByTestId('name-input'));
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: name } });
    fireEvent.click(screen.getByTestId('post-btn'));
  }

  it('submits with an existing mode id and does not create a mode', async () => {
    const findExisting = vi.spyOn(modes, 'findExistingMode').mockResolvedValue(EXISTING_MODE);
    const create = vi.spyOn(modes, 'createMode');
    vi.spyOn(client, 'submitScore').mockResolvedValue({ ok: true, id: 'x', rank: 3 });

    render(<GameOverLeaderboard score={5000} correct={10} cards={10} modeId={null} modeFilter={SET_FILTER} gameMode="scanner" />);
    await typeAndPost();

    await waitFor(() => expect(screen.getByTestId('post-confirm')).toBeInTheDocument());
    expect(findExisting).toHaveBeenCalledWith(SET_FILTER);
    expect(create).not.toHaveBeenCalled();
    expect(client.submitScore).toHaveBeenCalledWith({ name: 'Alice', score: 5000, correct: 10, cards: 10, modeId: 'existing-mode-id', gameMode: 'scanner' });
  });

  it('creates a mode when none exists and submits with the new id', async () => {
    vi.spyOn(modes, 'findExistingMode').mockResolvedValue(null);
    const create = vi.spyOn(modes, 'createMode').mockResolvedValue({ ok: true, existed: false, mode: NEW_MODE });
    vi.spyOn(client, 'submitScore').mockResolvedValue({ ok: true, id: 'x', rank: 1 });

    render(<GameOverLeaderboard score={5000} correct={10} cards={10} modeId={null} modeFilter={SET_FILTER} gameMode="mosaic" />);
    await typeAndPost();

    await waitFor(() => expect(screen.getByTestId('post-confirm')).toBeInTheDocument());
    expect(create).toHaveBeenCalledWith(SET_FILTER);
    expect(client.submitScore).toHaveBeenCalledWith({ name: 'Alice', score: 5000, correct: 10, cards: 10, modeId: 'new-mode-id', gameMode: 'mosaic' });
  });

  it('shows an error and does not submit when createMode fails', async () => {
    vi.spyOn(modes, 'findExistingMode').mockResolvedValue(null);
    vi.spyOn(modes, 'createMode').mockResolvedValue({ ok: false, reason: 'too-few-cards' });
    const submit = vi.spyOn(client, 'submitScore');

    render(<GameOverLeaderboard score={5000} correct={10} cards={10} modeId={null} modeFilter={SET_FILTER} gameMode="blur" />);
    await typeAndPost();

    await waitFor(() => expect(screen.getByTestId('post-error')).toBeInTheDocument());
    expect(submit).not.toHaveBeenCalled();
  });

  it('shows an error without resolving a mode when modeFilter is absent', async () => {
    const findExisting = vi.spyOn(modes, 'findExistingMode');
    const create = vi.spyOn(modes, 'createMode');
    const submit = vi.spyOn(client, 'submitScore');

    render(<GameOverLeaderboard score={5000} correct={10} cards={10} modeId={null} gameMode="blur" />);
    await typeAndPost();

    await waitFor(() => expect(screen.getByTestId('post-error')).toBeInTheDocument());
    expect(findExisting).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('does not fetch the board when modeId is null', async () => {
    const rank = vi.spyOn(client, 'fetchModeProjectedRank');
    const topScores = vi.spyOn(client, 'fetchModeTopScores');

    render(<GameOverLeaderboard score={5000} correct={10} cards={10} modeId={null} modeFilter={SET_FILTER} gameMode="blur" />);
    await waitFor(() => screen.getByTestId('name-input'));

    expect(rank).not.toHaveBeenCalled();
    expect(topScores).not.toHaveBeenCalled();
  });
});
