import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ModeDetail } from './ModeDetail';
import type { CustomFilter } from '../modes/filter';
import { fetchModeRuns } from '../leaderboard/client';
import type { Run } from '../leaderboard/boards';

vi.mock('../leaderboard/client', () => ({
  fetchModeRuns: vi.fn(async () => []),
}));
vi.mock('../leaderboard/identity', () => ({ getUserId: vi.fn(async () => 'me') }));
vi.mock('../reveal/client', () => ({ fetchEnabledRevealModes: vi.fn(async () => ['blur', 'scanner']) }));

const filter: CustomFilter = { types: ['Creature'] };

beforeEach(() => vi.clearAllMocks());

describe('ModeDetail', () => {
  it('renders the mode name, card count and the reveal list', async () => {
    render(<ModeDetail modeId="m1" modeName="EDHRec 1000" filter={filter} cardCount={1000} />);
    expect(screen.getByText('EDHRec 1000')).toBeTruthy();
    expect(screen.getByText(`${(1000).toLocaleString()} cards`)).toBeTruthy();
    await waitFor(() => expect(screen.getAllByTestId('reveal-row').length).toBe(2));
  });

  it('shows a LOGIN pending row when the run has no name', async () => {
    const onLogin = vi.fn();
    render(
      <ModeDetail
        modeId="m1"
        modeName="EDHRec 1000"
        filter={filter}
        pendingRow={{ rank: 1, name: null, score: 500, total: 500, correct: 5, gameMode: 'blur', onLogin }}
      />,
    );
    const row = await screen.findByTestId('pending-run-row');
    expect(row).toBeTruthy();
    fireEvent.click(screen.getByTestId('pending-login'));
    expect(onLogin).toHaveBeenCalledOnce();
  });

  it('shows the name (no LOGIN) in the pending row once a name is present', async () => {
    render(
      <ModeDetail
        modeId="m1"
        modeName="EDHRec 1000"
        filter={filter}
        pendingRow={{ rank: 2, name: 'Pete', score: 500, total: 500, correct: 5, gameMode: 'blur', onLogin: () => {} }}
      />,
    );
    const row = await screen.findByTestId('pending-run-row');
    expect(row.textContent).toContain('Pete');
    expect(screen.queryByTestId('pending-login')).toBeNull();
  });

  it('shows the true projected rank on a sparse board (not the insertion index)', async () => {
    render(
      <ModeDetail
        modeId="m1"
        modeName="EDHRec 1000"
        filter={filter}
        pendingRow={{ rank: 5, name: null, score: 500, total: 500, correct: 5, gameMode: 'blur', onLogin: () => {} }}
      />,
    );
    const row = await screen.findByTestId('pending-run-row');
    expect(row.textContent).toContain('#5');
  });

  it('explains the summed total and shows how many reveals feed it', async () => {
    vi.mocked(fetchModeRuns).mockResolvedValue([
      { id: 'r1', name: 'Pete', score: 5780, correct: 10, gameMode: 'blur', deviceId: 'me', country: null, createdAt: 1 },
    ]);
    render(<ModeDetail modeId="m1" modeName="EDHRec 1000" filter={filter} />);
    expect(screen.getByText(/best score in each reveal mode, summed/i)).toBeTruthy();
    const hint = await screen.findByTestId('standing-modes');
    // enabled mock = ['blur','scanner']; device scored only in blur.
    expect(hint.textContent).toContain('1 / 2 reveals');
    expect(hint.textContent).toContain('play more');
  });

  it('Your standing has a share button that copies a mode link with the total', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    vi.mocked(fetchModeRuns).mockResolvedValue([
      { id: 'r1', name: 'Pete', score: 5780, correct: 10, gameMode: 'blur', deviceId: 'me', country: null, createdAt: 1 },
    ]);
    render(<ModeDetail modeId="m1" modeName="EDHRec 1000" filter={filter} />);
    const btn = await screen.findByTestId('standing-share');
    fireEvent.click(btn);
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).toContain('EDHRec 1000');
    expect(writeText.mock.calls[0][0]).toContain('5780');
  });

  it('does not double-list a device that already has a persisted board entry', async () => {
    const runs: Run[] = [
      { id: 'r1', name: 'Pete', score: 5780, correct: 10, gameMode: 'blur', deviceId: 'me', country: null, createdAt: 1 },
      { id: 'r2', name: 'Jojo', score: 6000, correct: 11, gameMode: 'blur', deviceId: 'other', country: null, createdAt: 2 },
    ];
    vi.mocked(fetchModeRuns).mockResolvedValue(runs);
    render(
      <ModeDetail
        modeId="m1"
        modeName="EDHRec 1000"
        filter={filter}
        pendingRow={{ rank: 1, name: 'Pete', score: 6874, total: 6874, correct: 12, gameMode: 'blur', onLogin: () => {} }}
      />,
    );
    await screen.findByTestId('pending-run-row');
    // Pete's persisted (5780) row is replaced by the projected pending (6874) row,
    // so the player appears exactly once on the board.
    expect(screen.getAllByText('Pete').length).toBe(1);
    expect(screen.getByText('Jojo')).toBeTruthy();
  });

  it('daily lock: disables non-locked reveals and shows Play again', async () => {
    const onPlayAgain = vi.fn();
    const { container } = render(
      <ModeDetail modeId="m1" modeName="Daily" filter={filter} lockedReveal="blur" onPlayAgain={onPlayAgain} />,
    );
    await waitFor(() => expect(screen.getAllByTestId('reveal-row').length).toBe(2));
    const blur = container.querySelector('[data-reveal="blur"]') as HTMLElement;
    const scanner = container.querySelector('[data-reveal="scanner"]') as HTMLElement;
    expect(blur.getAttribute('data-disabled')).toBeNull();
    expect(scanner.getAttribute('data-disabled')).toBe('true');
    const again = screen.getByTestId('daily-play-again');
    expect(again.textContent).toContain('Play again');
    fireEvent.click(again);
    expect(onPlayAgain).toHaveBeenCalledOnce();
  });

  it('game-over: renders Home + Back to mode buttons and fires their handlers', async () => {
    const onHome = vi.fn();
    const onBackToMode = vi.fn();
    render(
      <ModeDetail modeId="m1" modeName="EDHRec 1000" filter={filter} onHome={onHome} onBackToMode={onBackToMode} />,
    );
    const home = await screen.findByTestId('gameover-home-bottom');
    const back = screen.getByTestId('gameover-back-to-mode');
    fireEvent.click(home);
    fireEvent.click(back);
    expect(onHome).toHaveBeenCalledOnce();
    expect(onBackToMode).toHaveBeenCalledOnce();
  });

  it('tolerates a null modeId (unplayed mode): still shows the pending row', async () => {
    render(
      <ModeDetail
        modeId={null}
        modeName="Brand new set"
        filter={filter}
        pendingRow={{ rank: 1, name: null, score: 100, total: 500, correct: 1, gameMode: 'blur', onLogin: () => {} }}
      />,
    );
    expect(await screen.findByTestId('pending-run-row')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByTestId('reveal-row').length).toBe(2));
  });
});
