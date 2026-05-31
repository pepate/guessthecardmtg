# Profile Area (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) tracking. TDD where tests are specified.

**Goal:** A start-screen profile panel: change display name, secure an anonymous account (email+password and/or Google), sign in on a new device, reset password, sign out.

**Architecture:** Thin auth module (`src/auth/*`) over `supabase.auth`, a `profiles` data client (`src/profile/client.ts`), and a `ProfilePanel` opened as a new start-screen `view`. A session store keeps the Phase 1 identity cache fresh and feeds a `useAuth` hook. No DB migration (Phase 1 `profiles` + `profiles_self` RLS already exist).

**Tech Stack:** React + Zustand, `@supabase/supabase-js` v2 auth, Vitest + Testing Library.

**Spec:** docs/superpowers/specs/2026-05-31-profile-area-phase2-design.md

---

## File Structure

- Modify `src/leaderboard/identity.ts` — export `setCachedUserId(id)` so the session store can refresh the cache on auth changes.
- Create `src/auth/session.ts` — subscribe to `onAuthStateChange`, track current user + password-recovery flag, refresh identity cache, expose `subscribe`/`getUserSnapshot`/`getRecoverySnapshot`.
- Create `src/auth/useAuth.ts` — `useAuth()` hook via `useSyncExternalStore`.
- Create `src/auth/actions.ts` — wrappers for secure/link/sign-in/reset/update-password/sign-out.
- Create `src/profile/client.ts` — `getProfile`, `upsertDisplayName`.
- Create `src/ui/ProfilePanel.tsx` — the panel (conditional sections by auth state).
- Modify `src/App.tsx` — `{ s: 'profile' }` view, top-right account icon, auto-open on password recovery, URL cleanup.

---

## Task 1: Expose identity cache setter

**Files:** Modify `src/leaderboard/identity.ts`; Modify `src/leaderboard/identity.test.ts`

- [ ] **Step 1: Add test** in `identity.test.ts`:
```ts
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
```
- [ ] **Step 2: Run** `npx vitest run src/leaderboard/identity.test.ts` → FAIL (no `setCachedUserId`).
- [ ] **Step 3: Implement** — add to `identity.ts`:
```ts
/** Force the cached identity (called by the auth session store on auth changes). */
export function setCachedUserId(id: string | null): void {
  cachedUserId = id;
}
```
- [ ] **Step 4: Run** the test → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: expose setCachedUserId for auth session sync"` (no Co-Authored-By).

---

## Task 2: Auth session store

**Files:** Create `src/auth/session.ts`; Create `src/auth/session.test.ts`

- [ ] **Step 1: Write the test** `src/auth/session.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSession = vi.fn();
let authCb: (event: string, session: unknown) => void = () => {};
const onAuthStateChange = vi.fn((cb) => { authCb = cb; return { data: { subscription: { unsubscribe: vi.fn() } } }; });
const setCachedUserId = vi.fn();

vi.mock('../supabase/client', () => ({ getSupabase: () => ({ auth: { getSession, onAuthStateChange } }) }));
vi.mock('../leaderboard/identity', () => ({ setCachedUserId }));

async function importSession() { vi.resetModules(); return import('./session'); }

beforeEach(() => { getSession.mockReset(); onAuthStateChange.mockClear(); setCachedUserId.mockReset(); getSession.mockResolvedValue({ data: { session: null } }); });

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
```
- [ ] **Step 2: Run** `npx vitest run src/auth/session.test.ts` → FAIL.
- [ ] **Step 3: Implement** `src/auth/session.ts`:
```ts
import type { User } from '@supabase/supabase-js';
import { getSupabase } from '../supabase/client';
import { setCachedUserId } from '../leaderboard/identity';

type Listener = () => void;
const listeners = new Set<Listener>();
let currentUser: User | null = null;
let recovering = false;
let started = false;

function emit() { for (const l of listeners) l(); }

function sync(user: User | null) {
  currentUser = user;
  setCachedUserId(user?.id ?? null);
  emit();
}

function start() {
  if (started) return;
  started = true;
  const c = getSupabase();
  if (!c) return;
  c.auth.getSession().then(({ data }) => sync(data.session?.user ?? null)).catch(() => {});
  c.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') { recovering = true; }
    sync(session?.user ?? null);
  });
}

/** Subscribe to auth-state changes. Returns an unsubscribe fn. Lazily starts the listener. */
export function subscribe(cb: Listener): () => void {
  start();
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
export function getUserSnapshot(): User | null { return currentUser; }
export function getRecoverySnapshot(): boolean { return recovering; }
/** Clear the recovery flag once the set-new-password UI has been shown/handled. */
export function clearRecovery(): void { recovering = false; }
```
- [ ] **Step 4: Run** the test → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: auth session store syncing identity cache + recovery flag"`.

---

## Task 3: useAuth hook

**Files:** Create `src/auth/useAuth.ts`; Create `src/auth/useAuth.test.tsx`

- [ ] **Step 1: Write the test** `src/auth/useAuth.test.tsx`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const state = { user: null as unknown, recovery: false };
vi.mock('./session', () => ({
  subscribe: (_cb: () => void) => () => {},
  getUserSnapshot: () => state.user,
  getRecoverySnapshot: () => state.recovery,
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
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `src/auth/useAuth.ts`:
```ts
import { useSyncExternalStore } from 'react';
import { subscribe, getUserSnapshot, getRecoverySnapshot } from './session';

export type AuthStatus = 'signed-out' | 'anonymous' | 'permanent';

export function useAuth() {
  const user = useSyncExternalStore(subscribe, getUserSnapshot, () => null);
  const recovery = useSyncExternalStore(subscribe, getRecoverySnapshot, () => false);
  const isAnonymous = !!user?.is_anonymous;
  const status: AuthStatus = !user ? 'signed-out' : isAnonymous ? 'anonymous' : 'permanent';
  return { user, isAnonymous, status, recovery };
}
```
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: useAuth hook"`.

---

## Task 4: Auth actions

**Files:** Create `src/auth/actions.ts`; Create `src/auth/actions.test.ts`

- [ ] **Step 1: Write the test** `src/auth/actions.test.ts`:
```ts
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

async function importActions() { vi.resetModules(); return import('./actions'); }
beforeEach(() => { Object.values(auth).forEach((f) => f.mockReset()); });

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
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `src/auth/actions.ts`:
```ts
import { getSupabase } from '../supabase/client';

export type ActionResult = { ok: true } | { ok: false; error: string };

const redirectTo = () =>
  (typeof window !== 'undefined' ? window.location.origin : '') + import.meta.env.BASE_URL;

function done(error: { message: string } | null): ActionResult {
  return error ? { ok: false, error: error.message } : { ok: true };
}
function offline(): ActionResult { return { ok: false, error: 'offline' }; }

export async function secureWithEmailPassword(email: string, password: string): Promise<ActionResult> {
  const c = getSupabase(); if (!c) return offline();
  return done((await c.auth.updateUser({ email, password })).error);
}
export async function linkGoogle(): Promise<ActionResult> {
  const c = getSupabase(); if (!c) return offline();
  return done((await c.auth.linkIdentity({ provider: 'google', options: { redirectTo: redirectTo() } })).error);
}
export async function signInWithPassword(email: string, password: string): Promise<ActionResult> {
  const c = getSupabase(); if (!c) return offline();
  return done((await c.auth.signInWithPassword({ email, password })).error);
}
export async function signInWithGoogle(): Promise<ActionResult> {
  const c = getSupabase(); if (!c) return offline();
  return done((await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo() } })).error);
}
export async function sendPasswordReset(email: string): Promise<ActionResult> {
  const c = getSupabase(); if (!c) return offline();
  return done((await c.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() })).error);
}
export async function updatePassword(password: string): Promise<ActionResult> {
  const c = getSupabase(); if (!c) return offline();
  return done((await c.auth.updateUser({ password })).error);
}
export async function signOut(): Promise<ActionResult> {
  const c = getSupabase(); if (!c) return offline();
  return done((await c.auth.signOut()).error);
}
```
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: auth action wrappers"`.

---

## Task 5: Profile data client

**Files:** Create `src/profile/client.ts`; Create `src/profile/client.test.ts`

- [ ] **Step 1: Write the test** `src/profile/client.test.ts` (mirror the chainable-query stub style from `src/leaderboard/client.test.ts`):
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
const from = vi.fn();
vi.mock('../supabase/client', () => ({ getSupabase: () => ({ from }) }));
function query(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'upsert', 'maybeSingle']) q[m] = vi.fn(() => q);
  (q as { then: unknown }).then = (f: (v: unknown) => unknown) => Promise.resolve(result).then(f);
  return q;
}
async function importClient() { vi.resetModules(); return import('./client'); }
beforeEach(() => { from.mockReset(); });

describe('getProfile', () => {
  it('maps a row to a Profile', async () => {
    from.mockReturnValueOnce(query({ data: { display_name: 'Al', games_played: 3, total_correct: 12, total_cards: 20 }, error: null }));
    const { getProfile } = await importClient();
    expect(await getProfile('uid')).toEqual({ displayName: 'Al', gamesPlayed: 3, totalCorrect: 12, totalCards: 20 });
  });
  it('returns null when there is no row', async () => {
    from.mockReturnValueOnce(query({ data: null, error: null }));
    const { getProfile } = await importClient();
    expect(await getProfile('uid')).toBeNull();
  });
});

describe('upsertDisplayName', () => {
  it('upserts on user_id and returns ok', async () => {
    const q = query({ error: null });
    from.mockReturnValueOnce(q);
    const { upsertDisplayName } = await importClient();
    expect(await upsertDisplayName('uid', 'Newname')).toEqual({ ok: true });
    expect(q.upsert).toHaveBeenCalledWith({ user_id: 'uid', display_name: 'Newname' }, { onConflict: 'user_id' });
  });
  it('returns the error message on failure', async () => {
    from.mockReturnValueOnce(query({ error: { message: 'nope' } }));
    const { upsertDisplayName } = await importClient();
    expect(await upsertDisplayName('uid', 'Newname')).toEqual({ ok: false, error: 'nope' });
  });
});
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `src/profile/client.ts`:
```ts
import { getSupabase } from '../supabase/client';

export interface Profile {
  displayName: string;
  gamesPlayed: number;
  totalCorrect: number;
  totalCards: number;
}

export async function getProfile(uid: string): Promise<Profile | null> {
  const c = getSupabase();
  if (!c) return null;
  const { data, error } = await c
    .from('profiles')
    .select('display_name,games_played,total_correct,total_cards')
    .eq('user_id', uid)
    .maybeSingle();
  if (error || !data) return null;
  return {
    displayName: data.display_name,
    gamesPlayed: data.games_played,
    totalCorrect: data.total_correct,
    totalCards: data.total_cards,
  };
}

export async function upsertDisplayName(
  uid: string,
  name: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const c = getSupabase();
  if (!c) return { ok: false, error: 'offline' };
  const { error } = await c
    .from('profiles')
    .upsert({ user_id: uid, display_name: name }, { onConflict: 'user_id' });
  return error ? { ok: false, error: error.message } : { ok: true };
}
```
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: profile data client (read + name upsert)"`.

---

## Task 6: ProfilePanel component

**Files:** Create `src/ui/ProfilePanel.tsx`; Create `src/ui/ProfilePanel.test.tsx`

Build a single panel that renders sections by `useAuth().status`, plus a password-recovery section when `useAuth().recovery` is true. Match existing styling (`ember-btn`, `ghost-btn`, panel container with `maxWidth: 420`, fonts/colors via CSS vars as in `GameOverLeaderboard.tsx`). Validate the name with `sanitizeName`/`NAME_MIN`/`NAME_MAX` from `../leaderboard/validation`. Use `getUserId` from `../leaderboard/identity` to load the profile on mount.

Required testids (for tests): `profile-panel`, `profile-name-input`, `profile-name-save`, `secure-email`, `secure-password`, `secure-submit`, `link-google`, `signin-email`, `signin-password`, `signin-submit`, `signin-google`, `forgot-password`, `recovery-password`, `recovery-submit`, `sign-out`, `profile-stats`, `profile-error`, `profile-notice`.

Behaviour by state:
- **recovery true** (any status): show ONLY a set-new-password form (`recovery-password` + `recovery-submit`) → `updatePassword` → on ok call `clearRecovery()` and show a success notice.
- **signed-out:** sign-in form (`signin-email`, `signin-password`, `signin-submit` → `signInWithPassword`), `signin-google` → `signInWithGoogle`, `forgot-password` → prompts for email then `sendPasswordReset` and shows "check your email".
- **anonymous:** name editor (`profile-name-input` + `profile-name-save` → `upsertDisplayName`), Secure section (`secure-email` + `secure-password` + `secure-submit` → `secureWithEmailPassword` → "check your email"; `link-google` → `linkGoogle`), `profile-stats` (games/correct/cards), and a "Sign in to another account" control that reveals the sign-in form with a visible warning that unsecured scores will be lost.
- **permanent:** name editor, linked-identity info (show `user.email` and whether google is in `user.identities`), offer `link-google`/secure-email for the not-yet-linked method, `profile-stats`, and `sign-out` → `signOut`.

All actions show their `{ ok:false, error }` message in `profile-error`. Name save validates length first (show error if `sanitizeName` returns null).

- [ ] **Step 1: Write component tests** `src/ui/ProfilePanel.test.tsx` covering: (a) signed-out renders `signin-submit` and not `sign-out`; (b) anonymous renders `secure-submit` + `profile-stats` and name save calls `upsertDisplayName`; (c) permanent renders `sign-out`; (d) recovery renders `recovery-submit` only. Mock `./useAuth` (`vi.mock('../auth/useAuth', ...)`), `../auth/actions`, `../profile/client`, and `../leaderboard/identity` (`getUserId` → 'uid'). Example for (b):
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../auth/useAuth', () => ({ useAuth: () => mockAuth }));
vi.mock('../auth/actions', () => actions);
vi.mock('../profile/client', () => profile);
vi.mock('../leaderboard/identity', () => ({ getUserId: vi.fn().mockResolvedValue('uid') }));

let mockAuth: { user: unknown; isAnonymous: boolean; status: string; recovery: boolean };
const actions = { secureWithEmailPassword: vi.fn(), linkGoogle: vi.fn(), signInWithPassword: vi.fn(), signInWithGoogle: vi.fn(), sendPasswordReset: vi.fn(), updatePassword: vi.fn(), signOut: vi.fn() };
const profile = { getProfile: vi.fn().mockResolvedValue({ displayName: 'Al', gamesPlayed: 2, totalCorrect: 8, totalCards: 14 }), upsertDisplayName: vi.fn().mockResolvedValue({ ok: true }) };

import { ProfilePanel } from './ProfilePanel';
beforeEach(() => { Object.values(actions).forEach((f) => f.mockReset()); profile.upsertDisplayName.mockResolvedValue({ ok: true }); });

it('anonymous: shows secure form + stats, and saves a new name', async () => {
  mockAuth = { user: { id: 'uid', is_anonymous: true }, isAnonymous: true, status: 'anonymous', recovery: false };
  render(<ProfilePanel />);
  expect(screen.getByTestId('secure-submit')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByTestId('profile-stats')).toBeInTheDocument());
  fireEvent.change(screen.getByTestId('profile-name-input'), { target: { value: 'Newname' } });
  fireEvent.click(screen.getByTestId('profile-name-save'));
  await waitFor(() => expect(profile.upsertDisplayName).toHaveBeenCalledWith('uid', 'Newname'));
});
```
- [ ] **Step 2: Run** `npx vitest run src/ui/ProfilePanel.test.tsx` → FAIL (no component).
- [ ] **Step 3: Implement** `src/ui/ProfilePanel.tsx` per the behaviour spec above. Keep it focused; if it exceeds ~400 lines, extract the sign-in form and secure form into sibling files (`ProfileSignIn.tsx`, `ProfileSecure.tsx`) and report DONE_WITH_CONCERNS noting the split.
- [ ] **Step 4: Run** the component tests → PASS. Then `npx tsc -p tsconfig.app.json --noEmit` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: profile panel (name, secure, sign-in, recovery, sign-out)"`.

---

## Task 7: App integration

**Files:** Modify `src/App.tsx`

- [ ] **Step 1: Add the profile view + account icon.**
  - Extend the `StartView` union: `| { s: 'profile' }`.
  - Import `ProfilePanel` and `useAuth`.
  - In the start header (the `else` branch rendering `.brandbar`, shown when not playing/loading), add a right-aligned account icon button (only at `phase === 'idle'`) with `data-testid="account-btn"` and `onClick={() => setView({ s: 'profile' })}`. Use an inline SVG user icon, styled like the existing `gameover-home` button (40×40, rounded, `--line-strong` border, blurred bg). Position it to the right (e.g. wrap brand + spacer + button, or absolutely position top-right within the header).
  - In the `AnimatePresence` block, add:
```tsx
{phase === 'idle' && view.s === 'profile' && <ProfilePanel key="profile" />}
```
  (The existing `BackButton` at `phase === 'idle' && view.s !== 'list'` already covers returning from the profile view.)
- [ ] **Step 2: Auto-open on password recovery + clean the URL.** Add near the other effects:
```tsx
const { recovery } = useAuth();
useEffect(() => {
  if (recovery && phase === 'idle') setView({ s: 'profile' });
}, [recovery, phase]);

// Strip auth params (OAuth/recovery) from the URL after supabase consumes them.
useEffect(() => {
  if (window.location.hash.includes('access_token') || window.location.search.includes('code=')) {
    const clean = window.location.origin + window.location.pathname;
    window.history.replaceState({}, '', clean);
  }
}, []);
```
- [ ] **Step 3: Verify** `npx tsc -p tsconfig.app.json --noEmit` → PASS; `npx vitest run` → all PASS.
- [ ] **Step 4: Commit** `git commit -m "feat: profile view + account icon, password-recovery auto-open"`.

---

## Task 8: Full verification

- [ ] **Step 1:** `npx vitest run` → all green.
- [ ] **Step 2:** `npm run build` → succeeds.
- [ ] (e2e is intentionally skipped — the golden-path suite is stale/unrelated, tracked separately.)

---

## Self-Review

**Spec coverage:** name change (Task 5+6), secure email+password (Task 4+6), link/sign-in Google (Task 4+6), cross-device sign-in (Task 4+6), password reset + recovery (Task 4+6+7), sign out (Task 4+6), entry point + view + recovery routing (Task 7), reactive session keeping identity cache fresh (Task 1+2+3).

**Placeholders:** none — every module has complete code; ProfilePanel has a precise behaviour + testid contract.

**Type consistency:** `ActionResult` shape shared across `auth/actions`; `Profile` shape shared `profile/client`↔panel; `setCachedUserId` defined (Task 1) and consumed (Task 2); `useAuth` shape (`{ user, isAnonymous, status, recovery }`) consumed in Task 6/7.
