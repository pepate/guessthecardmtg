import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { usePendingRun, type PendingRun } from './usePendingRun';

vi.mock('./client', () => ({
  isLeaderboardEnabled: () => true,
  fetchModeProjectedRank: vi.fn(async () => ({ rank: 3, total: 9 })),
  submitScore: vi.fn(async () => ({ ok: true, id: 'row1', rank: 2 })),
}));
vi.mock('./identity', () => ({ getUserId: vi.fn(async () => 'uid1') }));
vi.mock('../profile/client', () => ({ getProfile: vi.fn(async () => null) }));
vi.mock('../modes/client', () => ({
  findExistingMode: vi.fn(async () => null),
  createMode: vi.fn(async () => ({ ok: true, mode: { id: 'm1' } })),
}));

import { getProfile } from '../profile/client';
import { submitScore } from './client';

const run: PendingRun = { score: 100, correct: 4, cards: 6, gameMode: 'blur' };

function Harness({ modeId }: { modeId: string | null }) {
  const s = usePendingRun(run, modeId, { types: ['Creature'] });
  return (
    <div>
      <span data-testid="needs-login">{String(s.needsLogin)}</span>
      <span data-testid="projected">{String(s.projectedRank)}</span>
      <span data-testid="posted">{String(s.postedRank)}</span>
      <button data-testid="post-now" onClick={() => void s.postNow()}>post</button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('usePendingRun', () => {
  it('shows LOGIN and does NOT post when the player has no name', async () => {
    render(<Harness modeId="m1" />);
    await waitFor(() => expect(screen.getByTestId('projected').textContent).toBe('3'));
    expect(screen.getByTestId('needs-login').textContent).toBe('true');
    expect(submitScore).not.toHaveBeenCalled();
  });

  it('auto-posts when the player already has a name', async () => {
    (getProfile as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce({ displayName: 'Pete' });
    render(<Harness modeId="m1" />);
    await waitFor(() => expect(screen.getByTestId('posted').textContent).toBe('2'));
    expect(submitScore).toHaveBeenCalledOnce();
    expect(screen.getByTestId('needs-login').textContent).toBe('false');
  });

  it('postNow() posts after a name has been saved', async () => {
    render(<Harness modeId="m1" />);
    await waitFor(() => expect(screen.getByTestId('needs-login').textContent).toBe('true'));
    (getProfile as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce({ displayName: 'Pete' });
    await act(async () => { screen.getByTestId('post-now').click(); });
    await waitFor(() => expect(screen.getByTestId('posted').textContent).toBe('2'));
    expect(submitScore).toHaveBeenCalledOnce();
  });

  it('does not submit twice when post-now is clicked after a completed post', async () => {
    (getProfile as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce({ displayName: 'Pete' });
    render(<Harness modeId="m1" />);
    await waitFor(() => expect(screen.getByTestId('posted').textContent).toBe('2'));
    expect(submitScore).toHaveBeenCalledOnce();
    await act(async () => { screen.getByTestId('post-now').click(); });
    expect(submitScore).toHaveBeenCalledOnce();
  });
});
