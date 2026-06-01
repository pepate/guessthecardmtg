import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ModeDetail } from './ModeDetail';
import type { CustomFilter } from '../modes/filter';

vi.mock('../leaderboard/client', () => ({
  fetchRevealLeaders: vi.fn(async () => ({})),
  fetchModeRuns: vi.fn(async () => []),
}));
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
        pendingRow={{ rank: 1, name: null, score: 500, correct: 5, gameMode: 'blur', onLogin }}
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
        pendingRow={{ rank: 2, name: 'Pete', score: 500, correct: 5, gameMode: 'blur', onLogin: () => {} }}
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
        pendingRow={{ rank: 5, name: null, score: 500, correct: 5, gameMode: 'blur', onLogin: () => {} }}
      />,
    );
    const row = await screen.findByTestId('pending-run-row');
    expect(row.textContent).toContain('#5');
  });

  it('daily lock: disables non-locked reveals and shows Play again with plays left', async () => {
    const onPlayAgain = vi.fn();
    render(
      <ModeDetail modeId="m1" modeName="Daily" filter={filter} lockedReveal="blur" playsLeft={2} onPlayAgain={onPlayAgain} />,
    );
    await waitFor(() => expect(screen.getAllByTestId('reveal-row').length).toBe(2));
    const blur = screen.getByText('Blur').closest('[data-testid="reveal-row"]') as HTMLElement;
    const scanner = screen.getByText('Scanner').closest('[data-testid="reveal-row"]') as HTMLElement;
    expect(blur.getAttribute('data-disabled')).toBeNull();
    expect(scanner.getAttribute('data-disabled')).toBe('true');
    const again = screen.getByTestId('daily-play-again');
    expect(again.textContent).toContain('Play again (2 left)');
    fireEvent.click(again);
    expect(onPlayAgain).toHaveBeenCalledOnce();
  });

  it('daily lock: at 0 plays left, no Play again and the locked reveal is disabled too', async () => {
    render(
      <ModeDetail modeId="m1" modeName="Daily" filter={filter} lockedReveal="blur" playsLeft={0} onPlayAgain={() => {}} />,
    );
    await waitFor(() => expect(screen.getAllByTestId('reveal-row').length).toBe(2));
    const blur = screen.getByText('Blur').closest('[data-testid="reveal-row"]') as HTMLElement;
    expect(blur.getAttribute('data-disabled')).toBe('true');
    expect(screen.queryByTestId('daily-play-again')).toBeNull();
  });

  it('tolerates a null modeId (unplayed mode): still shows the pending row', async () => {
    render(
      <ModeDetail
        modeId={null}
        modeName="Brand new set"
        filter={filter}
        pendingRow={{ rank: 1, name: null, score: 100, correct: 1, gameMode: 'blur', onLogin: () => {} }}
      />,
    );
    expect(await screen.findByTestId('pending-run-row')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByTestId('reveal-row').length).toBe(2));
  });
});
