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
  // No session/profile → the player has no name yet → the onboarding overlay shows.
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

  it('shows the onboarding overlay (name + projected rank) for a player with no name yet', async () => {
    render(<GameOverLeaderboard score={5000} correct={10} cards={10} modeId={MODE_ID} gameMode="blur" />);
    await waitFor(() => expect(screen.getByTestId('onboard-overlay')).toBeInTheDocument());
    expect(screen.getByTestId('onboard-name')).toBeInTheDocument();
    expect(screen.getByTestId('onboard-projected')).toHaveTextContent('#4');
  });

  it('keeps Save disabled for a too-short name and does not submit', async () => {
    const submit = vi.spyOn(client, 'submitScore');
    render(<GameOverLeaderboard score={5000} correct={10} cards={10} modeId={MODE_ID} gameMode="blur" />);
    await waitFor(() => screen.getByTestId('onboard-name'));
    fireEvent.change(screen.getByTestId('onboard-name'), { target: { value: 'ab' } });
    expect(screen.getByTestId('onboard-save')).toBeDisabled();
    fireEvent.click(screen.getByTestId('onboard-save'));
    expect(submit).not.toHaveBeenCalled();
  });

  it('enables Save once a valid name is typed', async () => {
    render(<GameOverLeaderboard score={5000} correct={10} cards={10} modeId={MODE_ID} gameMode="blur" />);
    await waitFor(() => screen.getByTestId('onboard-name'));
    fireEvent.change(screen.getByTestId('onboard-name'), { target: { value: 'Alice' } });
    expect(screen.getByTestId('onboard-save')).not.toBeDisabled();
  });

  it('submits with modeId+gameMode and shows a confirmation, persisting the name', async () => {
    vi.spyOn(client, 'submitScore').mockResolvedValue({ ok: true, id: 'x', rank: 4 });
    render(<GameOverLeaderboard score={5000} correct={10} cards={10} modeId={MODE_ID} gameMode="blur" />);
    await waitFor(() => screen.getByTestId('onboard-name'));
    fireEvent.change(screen.getByTestId('onboard-name'), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByTestId('onboard-save'));
    await waitFor(() => expect(screen.getByTestId('post-confirm')).toBeInTheDocument());
    expect(localStorage.getItem('guessthecard.playername')).toBe('Alice');
    expect(client.submitScore).toHaveBeenCalledWith({ name: 'Alice', score: 5000, correct: 10, cards: 10, modeId: MODE_ID, gameMode: 'blur' });
  });

  it('shows an error in the overlay when submission fails', async () => {
    vi.spyOn(client, 'submitScore').mockResolvedValue({ ok: false, reason: 'rate-limited' });
    render(<GameOverLeaderboard score={5000} correct={10} cards={10} modeId={MODE_ID} gameMode="blur" />);
    await waitFor(() => screen.getByTestId('onboard-name'));
    fireEvent.change(screen.getByTestId('onboard-name'), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByTestId('onboard-save'));
    await waitFor(() => expect(screen.getByTestId('onboard-error')).toBeInTheDocument());
  });

  it('flags a taken name and does not confirm', async () => {
    vi.spyOn(client, 'submitScore').mockResolvedValue({ ok: false, reason: 'name-taken' });
    render(<GameOverLeaderboard score={5000} correct={10} cards={10} modeId={MODE_ID} gameMode="blur" />);
    await waitFor(() => screen.getByTestId('onboard-name'));
    fireEvent.change(screen.getByTestId('onboard-name'), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByTestId('onboard-save'));
    await waitFor(() => expect(screen.getByTestId('onboard-taken')).toBeInTheDocument());
    expect(screen.queryByTestId('post-confirm')).toBeNull();
  });

  it('lets the player dismiss the overlay back to the board without posting', async () => {
    const submit = vi.spyOn(client, 'submitScore');
    render(<GameOverLeaderboard score={5000} correct={10} cards={10} modeId={MODE_ID} gameMode="blur" />);
    await waitFor(() => screen.getByTestId('onboard-overlay'));
    fireEvent.click(screen.getByTestId('onboard-close'));
    expect(screen.queryByTestId('onboard-overlay')).toBeNull();
    expect(screen.getByTestId('projected-rank')).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
  });
});

describe('GameOverLeaderboard lazy set-mode creation', () => {
  const SET_FILTER: CustomFilter = { sets: ['dom'] };
  const NEW_MODE = { id: 'new-mode-id', name: 'DOM', filter: SET_FILTER, card_count: 60 };
  const EXISTING_MODE = { id: 'existing-mode-id', name: 'DOM', filter: SET_FILTER, card_count: 60 };

  async function typeAndSave(name = 'Alice') {
    await waitFor(() => screen.getByTestId('onboard-name'));
    fireEvent.change(screen.getByTestId('onboard-name'), { target: { value: name } });
    fireEvent.click(screen.getByTestId('onboard-save'));
  }

  it('submits with an existing mode id and does not create a mode', async () => {
    const findExisting = vi.spyOn(modes, 'findExistingMode').mockResolvedValue(EXISTING_MODE);
    const create = vi.spyOn(modes, 'createMode');
    vi.spyOn(client, 'submitScore').mockResolvedValue({ ok: true, id: 'x', rank: 3 });

    render(<GameOverLeaderboard score={5000} correct={10} cards={10} modeId={null} modeFilter={SET_FILTER} gameMode="scanner" />);
    await typeAndSave();

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
    await typeAndSave();

    await waitFor(() => expect(screen.getByTestId('post-confirm')).toBeInTheDocument());
    expect(create).toHaveBeenCalledWith(SET_FILTER);
    expect(client.submitScore).toHaveBeenCalledWith({ name: 'Alice', score: 5000, correct: 10, cards: 10, modeId: 'new-mode-id', gameMode: 'mosaic' });
  });

  it('shows an error and does not submit when createMode fails', async () => {
    vi.spyOn(modes, 'findExistingMode').mockResolvedValue(null);
    vi.spyOn(modes, 'createMode').mockResolvedValue({ ok: false, reason: 'too-few-cards' });
    const submit = vi.spyOn(client, 'submitScore');

    render(<GameOverLeaderboard score={5000} correct={10} cards={10} modeId={null} modeFilter={SET_FILTER} gameMode="blur" />);
    await typeAndSave();

    await waitFor(() => expect(screen.getByTestId('onboard-error')).toBeInTheDocument());
    expect(submit).not.toHaveBeenCalled();
  });

  it('shows an error without resolving a mode when modeFilter is absent', async () => {
    const findExisting = vi.spyOn(modes, 'findExistingMode');
    const create = vi.spyOn(modes, 'createMode');
    const submit = vi.spyOn(client, 'submitScore');

    render(<GameOverLeaderboard score={5000} correct={10} cards={10} modeId={null} gameMode="blur" />);
    await typeAndSave();

    await waitFor(() => expect(screen.getByTestId('onboard-error')).toBeInTheDocument());
    expect(findExisting).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('does not fetch the board when modeId is null', async () => {
    const rank = vi.spyOn(client, 'fetchModeProjectedRank');
    const topScores = vi.spyOn(client, 'fetchModeTopScores');

    render(<GameOverLeaderboard score={5000} correct={10} cards={10} modeId={null} modeFilter={SET_FILTER} gameMode="blur" />);
    await waitFor(() => screen.getByTestId('onboard-name'));

    expect(rank).not.toHaveBeenCalled();
    expect(topScores).not.toHaveBeenCalled();
  });
});
