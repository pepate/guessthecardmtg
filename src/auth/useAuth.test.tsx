import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const state = { user: null as unknown, recovery: false };
vi.mock('./session', () => ({
  subscribe: (_cb: () => void) => () => {},
  getUserSnapshot: () => state.user,
  getRecoverySnapshot: () => state.recovery,
  getAuthErrorSnapshot: () => null,
}));

import { useAuth } from './useAuth';

describe('useAuth', () => {
  it('reports signed-out when there is no user', () => {
    state.user = null;
    const { result } = renderHook(() => useAuth());
    expect(result.current.status).toBe('signed-out');
    expect(result.current.isAnonymous).toBe(false);
  });

  it('reports anonymous', () => {
    state.user = { id: 'u', is_anonymous: true };
    const { result } = renderHook(() => useAuth());
    expect(result.current.status).toBe('anonymous');
    expect(result.current.isAnonymous).toBe(true);
  });

  it('reports permanent for a non-anonymous user', () => {
    state.user = { id: 'u', is_anonymous: false, email: 'a@b.c' };
    const { result } = renderHook(() => useAuth());
    expect(result.current.status).toBe('permanent');
  });
});
