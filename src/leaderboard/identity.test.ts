import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSession = vi.fn();
const signInAnonymously = vi.fn();

vi.mock('../supabase/client', () => ({
  getSupabase: () => ({ auth: { getSession, signInAnonymously } }),
}));

async function importIdentity() {
  vi.resetModules();
  return import('./identity');
}

beforeEach(() => {
  getSession.mockReset();
  signInAnonymously.mockReset();
});

describe('getUserId', () => {
  it('returns the id from an existing session', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'uid-1' } } } });
    const { getUserId } = await importIdentity();
    expect(await getUserId()).toBe('uid-1');
  });

  it('returns null when there is no session and does NOT create one', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const { getUserId } = await importIdentity();
    expect(await getUserId()).toBeNull();
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it('caches the id so a second call skips getSession', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'uid-1' } } } });
    const { getUserId } = await importIdentity();
    await getUserId();
    await getUserId();
    expect(getSession).toHaveBeenCalledTimes(1);
  });
});

describe('ensureUserId', () => {
  it('reuses an existing session', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'uid-1' } } } });
    const { ensureUserId } = await importIdentity();
    expect(await ensureUserId()).toBe('uid-1');
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it('signs in anonymously when there is no session', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    signInAnonymously.mockResolvedValue({ data: { user: { id: 'uid-new' } }, error: null });
    const { ensureUserId } = await importIdentity();
    expect(await ensureUserId()).toBe('uid-new');
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it('returns null when anonymous sign-in fails', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    signInAnonymously.mockResolvedValue({ data: { user: null }, error: { message: 'nope' } });
    const { ensureUserId } = await importIdentity();
    expect(await ensureUserId()).toBeNull();
  });
});

describe('setCachedUserId', () => {
  it('overrides the cached id so getUserId returns it without hitting getSession', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const { setCachedUserId, getUserId } = await importIdentity();
    setCachedUserId('uid-forced');
    expect(await getUserId()).toBe('uid-forced');
    expect(getSession).not.toHaveBeenCalled();
  });

  it('clears the cache when passed null (forces a re-read)', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'uid-sess' } } } });
    const { setCachedUserId, getUserId } = await importIdentity();
    setCachedUserId('uid-old');
    setCachedUserId(null);
    expect(await getUserId()).toBe('uid-sess');
  });
});
