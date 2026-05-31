import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSession = vi.fn();
const getUser = vi.fn();
let authCb: (event: string, session: unknown) => void = () => {};
const onAuthStateChange = vi.fn((cb: typeof authCb) => {
  authCb = cb;
  return { data: { subscription: { unsubscribe: vi.fn() } } };
});
const setCachedUserId = vi.fn();

vi.mock('../supabase/client', () => ({ getSupabase: () => ({ auth: { getSession, getUser, onAuthStateChange } }) }));
vi.mock('../leaderboard/identity', () => ({ setCachedUserId }));

async function importSession() {
  vi.resetModules();
  return import('./session');
}

beforeEach(() => {
  getSession.mockReset();
  getUser.mockReset();
  onAuthStateChange.mockClear();
  setCachedUserId.mockReset();
  getSession.mockResolvedValue({ data: { session: null } });
  // No-op refresh by default so tests observe the JWT-derived user.
  getUser.mockResolvedValue({ data: { user: null } });
});

describe('session store', () => {
  it('notifies subscribers and updates the identity cache on SIGNED_IN', async () => {
    const { subscribe, getUserSnapshot } = await importSession();
    const cb = vi.fn();
    subscribe(cb);
    authCb('SIGNED_IN', { user: { id: 'uid-1', is_anonymous: false } });
    expect(getUserSnapshot()).toEqual({ id: 'uid-1', is_anonymous: false });
    expect(setCachedUserId).toHaveBeenCalledWith('uid-1');
    expect(cb).toHaveBeenCalled();
  });

  it('clears user and cache on SIGNED_OUT', async () => {
    const { subscribe, getUserSnapshot } = await importSession();
    subscribe(vi.fn());
    authCb('SIGNED_IN', { user: { id: 'uid-1' } });
    authCb('SIGNED_OUT', null);
    expect(getUserSnapshot()).toBeNull();
    expect(setCachedUserId).toHaveBeenLastCalledWith(null);
  });

  it('tracks PASSWORD_RECOVERY in the recovery snapshot', async () => {
    const { subscribe, getRecoverySnapshot } = await importSession();
    subscribe(vi.fn());
    authCb('PASSWORD_RECOVERY', { user: { id: 'uid-1' } });
    expect(getRecoverySnapshot()).toBe(true);
  });

  it('unsubscribe stops notifications', async () => {
    const { subscribe } = await importSession();
    const cb = vi.fn();
    const off = subscribe(cb);
    off();
    authCb('SIGNED_IN', { user: { id: 'x' } });
    expect(cb).not.toHaveBeenCalled();
  });
});
