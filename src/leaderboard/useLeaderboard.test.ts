import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useLeaderboard } from './useLeaderboard';
import * as client from './client';
import type { GlobalEntry } from './types';

const entry: GlobalEntry = {
  id: '1', name: 'Al', score: 900, correct: 9, gameModes: ['blur'], country: 'DE', createdAt: 0, deviceId: 'dev-al',
};

beforeEach(() => vi.restoreAllMocks());

describe('useLeaderboard', () => {
  it('loads entries for a mode id', async () => {
    vi.spyOn(client, 'fetchModeTopScores').mockResolvedValue([entry]);
    const { result } = renderHook(() => useLeaderboard('mode-uuid', 5));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entries).toEqual([entry]);
    expect(result.current.error).toBe(false);
  });

  it('sets error when the fetch rejects', async () => {
    vi.spyOn(client, 'fetchModeTopScores').mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useLeaderboard('popular-mode-uuid', 5));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
    expect(result.current.entries).toEqual([]);
  });

  it('does not fetch when the mode id is empty (builtins not yet resolved)', async () => {
    const spy = vi.spyOn(client, 'fetchModeTopScores').mockResolvedValue([entry]);
    const { result } = renderHook(() => useLeaderboard('', 5));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(spy).not.toHaveBeenCalled();
    expect(result.current.entries).toEqual([]);
  });

  it('refetches when refreshKey changes', async () => {
    const spy = vi.spyOn(client, 'fetchModeTopScores').mockResolvedValue([entry]);
    const { rerender } = renderHook(({ k }) => useLeaderboard('mode-uuid', 5, 'all', k), {
      initialProps: { k: 0 },
    });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    rerender({ k: 1 });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  });
});
