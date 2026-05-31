import { describe, it, expect, vi, beforeEach } from 'vitest';

const auth = {
  updateUser: vi.fn(),
  linkIdentity: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithOAuth: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  signOut: vi.fn(),
};
vi.mock('../supabase/client', () => ({ getSupabase: () => ({ auth }) }));

async function importActions() {
  vi.resetModules();
  return import('./actions');
}

beforeEach(() => {
  Object.values(auth).forEach((f) => f.mockReset());
});

describe('auth actions', () => {
  it('secureWithEmailPassword calls updateUser with email+password', async () => {
    auth.updateUser.mockResolvedValue({ error: null });
    const { secureWithEmailPassword } = await importActions();
    expect(await secureWithEmailPassword('a@b.c', 'pw123456')).toEqual({ ok: true });
    expect(auth.updateUser).toHaveBeenCalledWith({ email: 'a@b.c', password: 'pw123456' });
  });

  it('normalizes errors to { ok:false, error }', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    const { signInWithPassword } = await importActions();
    expect(await signInWithPassword('a@b.c', 'x')).toEqual({ ok: false, error: 'Invalid login credentials' });
  });

  it('linkGoogle / signInWithGoogle pass provider google with a redirectTo', async () => {
    auth.linkIdentity.mockResolvedValue({ error: null });
    auth.signInWithOAuth.mockResolvedValue({ error: null });
    const { linkGoogle, signInWithGoogle } = await importActions();
    await linkGoogle();
    await signInWithGoogle();
    expect(auth.linkIdentity.mock.calls[0][0]).toMatchObject({ provider: 'google' });
    expect(auth.signInWithOAuth.mock.calls[0][0]).toMatchObject({ provider: 'google' });
  });

  it('sendPasswordReset and updatePassword and signOut', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    auth.updateUser.mockResolvedValue({ error: null });
    auth.signOut.mockResolvedValue({ error: null });
    const a = await importActions();
    expect(await a.sendPasswordReset('a@b.c')).toEqual({ ok: true });
    expect(await a.updatePassword('newpass123')).toEqual({ ok: true });
    expect(await a.signOut()).toEqual({ ok: true });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'newpass123' });
  });
});
