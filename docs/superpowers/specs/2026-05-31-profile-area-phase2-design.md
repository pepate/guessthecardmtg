# Profile Area (Phase 2) — Design

**Status:** approved 2026-05-31. Builds on the Phase 1 auth identity (Supabase anonymous auth, `profiles` table with `display_name` + counters, `profiles_self` RLS).

## Goal

A profile area where a player can change their display name, secure their (anonymous) account by linking email+password and/or Google, sign in on a new device to recover that account cross-device, and sign out. Entry point: an account icon in the top-right of the start-screen header.

## Decisions (locked)

- **Secure methods:** Google **and** email+password (full flow incl. confirmation + password reset).
- **Scope:** everything in one phase (name change, secure account, cross-device sign-in, sign out).
- **Entry point:** account icon top-right in the start-screen header → opens the panel as a new start-screen `view` (`{ s: 'profile' }`).
- **Conflict case:** signing into an existing account on a device that has an anonymous session simply switches to the existing account; the throwaway anonymous user is abandoned (its orphaned scores stay under its uid, inaccessible). No score merging.

## Architecture

Custom panel + a thin auth module, matching the existing one-panel pattern (`RevealPicker`, `CustomModeBuilder`). No Supabase Auth UI dependency. No DB migration — `profiles` and `profiles_self` RLS already exist; name writes go through that policy.

### Modules (small, focused, testable)

- **`src/auth/session.ts`** — subscribes to `supabase.auth.onAuthStateChange`, keeps the Phase 1 identity cache (`src/leaderboard/identity.ts` `cachedUserId`) fresh on SIGNED_IN/SIGNED_OUT/USER_UPDATED, and exposes a `subscribe(cb)` + `getSnapshot()` for React. Critical: without this, `getUserId()` returns a stale uid after login/logout.
- **`src/auth/useAuth.ts`** — `useAuth(): { user, isAnonymous, status }` via `useSyncExternalStore` over `session.ts`. `isAnonymous = !!user?.is_anonymous`. Exposes `user.email` and `user.identities` (provider list) for the panel.
- **`src/auth/actions.ts`** — thin wrappers returning `{ ok, error? }`:
  - `secureWithEmailPassword(email, password)` → `updateUser({ email, password })`
  - `linkGoogle()` → `linkIdentity({ provider:'google', options:{ redirectTo } })`
  - `signInWithPassword(email, password)` → `signInWithPassword(...)`
  - `signInWithGoogle()` → `signInWithOAuth({ provider:'google', options:{ redirectTo } })`
  - `sendPasswordReset(email)` → `resetPasswordForEmail(email, { redirectTo })`
  - `updatePassword(password)` → `updateUser({ password })`
  - `signOut()` → `auth.signOut()`
  - `redirectTo = window.location.origin + import.meta.env.BASE_URL`
- **`src/profile/client.ts`** — `getProfile(uid)` → `{ displayName, gamesPlayed, totalCorrect, totalCards } | null`; `upsertDisplayName(uid, name)` → upsert (a never-played anon has no profiles row yet) via the self RLS policy. Reuses `sanitizeName` from `src/leaderboard/validation`.
- **`src/ui/ProfilePanel.tsx`** (+ focused sub-sections to keep files small) — the view; conditional sections by auth state.
- **`src/App.tsx`** — add `{ s: 'profile' }` to the `StartView` union, render `<ProfilePanel/>`, and add a top-right account icon button (shown at `phase === 'idle'`) that sets the profile view.

### Panel states (driven by `useAuth`)

| State | Sections |
|---|---|
| **No session** (never played) | Sign-in form (email+password · Google) · "Forgot password" |
| **Anonymous** (`is_anonymous`) | Name editor · Secure account (email+password form / link Google) · stats · "Sign in to another account" (warns that unsecured scores are lost) |
| **Permanent** (email and/or google linked) | Name editor · linked identities (show email/Google, offer to link the other) · stats · Sign out |

### Auth flows

- **Secure (anon→permanent):** `secureWithEmailPassword` sends a confirmation email and sets the password immediately → panel shows "Check your email to confirm." `linkGoogle` redirects to Google and back.
- **Sign in (new device / switch):** `signInWithPassword` / `signInWithGoogle`; replaces the current (anon) session.
- **Forgot password:** `sendPasswordReset` → email link → app returns and `onAuthStateChange` fires `PASSWORD_RECOVERY` → panel shows a set-new-password form → `updatePassword`.
- **Redirect handling:** OAuth/email links return to `/guessthecardmtg/`; supabase-js (default `detectSessionInUrl`) sets the session, then the app strips auth params from the URL. The redirect allowlist already includes localhost + Pages.
- **Sign out:** offered only to permanent users. Anonymous users get "Sign in to another account" with a warning instead (a plain sign-out would silently orphan their scores).

### Data flow

`ProfilePanel` reads auth state from `useAuth`, fetches `getProfile(uid)` for name+stats on open, and calls `auth/actions` + `profile/client` for mutations. After a successful name change it re-reads the profile. Auth changes propagate through `session.ts` → `useAuth` re-render.

### Error handling

Inline, per-form messages for: email already in use, weak password (Supabase min length), invalid credentials, rate-limited, network failure, and a "confirmation pending" state after securing with email. All action wrappers normalize to `{ ok:false, error:<message> }`.

### Testing

- Unit: `profile/client` (read/upsert with mocked supabase), `auth/actions` (each wrapper calls the right supabase method with the right args), `session.ts` (cache updates on auth events), `useAuth` (state derivation).
- Component: `ProfilePanel` renders the correct section per auth state (mock `useAuth`) and wires actions.
- No e2e (the golden-path suite is stale/unrelated). Live smoke (Google redirect, email confirm/reset) is manual by the user after SMTP setup.

## Prerequisites (dashboard, user-configured)

1. **Enable "Manual linking"** in Supabase Auth settings — required for `linkIdentity`. (Attempt to set via Management API during deploy; otherwise user toggles it.)
2. **Configure custom SMTP** — built-in email is rate-limited/unreliable; email confirmation + password reset depend on it. Email flows cannot be live-tested until this is set.

## Out of scope (later)

Phase 3 stats display section (this phase only surfaces the raw counters in the panel). Score merging across accounts. Account deletion.
