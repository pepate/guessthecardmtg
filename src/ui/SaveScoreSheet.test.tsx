import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SaveScoreSheet } from './SaveScoreSheet';

vi.mock('../leaderboard/identity', () => ({
  ensureUserId: vi.fn(() => Promise.resolve('uid')),
}));
vi.mock('../profile/client', () => ({
  checkNameAvailable: vi.fn(() => Promise.resolve(true)),
  upsertDisplayName: vi.fn(() => Promise.resolve({ ok: true })),
}));
// SignInForm pulls in the whole auth/supabase stack — stub it for this unit.
vi.mock('./ProfilePanel', () => ({ SignInForm: () => <div data-testid="signin-form" /> }));

import { checkNameAvailable, upsertDisplayName } from '../profile/client';

const mockCheck = checkNameAvailable as ReturnType<typeof vi.fn>;
const mockUpsert = upsertDisplayName as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockCheck.mockResolvedValue(true);
  mockUpsert.mockResolvedValue({ ok: true });
});

describe('SaveScoreSheet', () => {
  it('saves the name, posts the run with that name, and closes on success', async () => {
    const onSaved = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    render(<SaveScoreSheet rank={8} modeName="EDHRec 100" onSaved={onSaved} onClose={onClose} />);

    fireEvent.change(screen.getByTestId('save-score-name'), { target: { value: 'YourMama' } });
    fireEvent.click(screen.getByTestId('save-score-submit'));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('YourMama'));
    expect(mockUpsert).toHaveBeenCalledWith('uid', 'YourMama');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('shows an error and stays open when the post fails', async () => {
    const onSaved = vi.fn().mockResolvedValue(false);
    const onClose = vi.fn();
    render(<SaveScoreSheet rank={8} onSaved={onSaved} onClose={onClose} />);

    fireEvent.change(screen.getByTestId('save-score-name'), { target: { value: 'YourMama' } });
    fireEvent.click(screen.getByTestId('save-score-submit'));

    await waitFor(() => expect(screen.getByTestId('save-score-error')).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('rejects a too-short name before touching the network', async () => {
    const onSaved = vi.fn().mockResolvedValue(true);
    render(<SaveScoreSheet rank={null} onSaved={onSaved} onClose={vi.fn()} />);

    fireEvent.change(screen.getByTestId('save-score-name'), { target: { value: 'ab' } });
    fireEvent.click(screen.getByTestId('save-score-submit'));

    await waitFor(() => expect(screen.getByTestId('save-score-error')).toBeInTheDocument());
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
