# Supabase Auth Identity — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the spoofable, client-supplied `device_id` identity with a real Supabase anonymous-auth identity (`auth.uid()`), keyed under a player `profiles` row that holds the display name and lifetime game counters — without changing how the game plays.

**Architecture:** A player signs in anonymously (`signInAnonymously`) the first time they post a score; the JWT is attached automatically to the `submit-score` Edge Function, which now derives identity from the **verified** token instead of trusting the request body. The existing `leaderboard.device_id` column is **reused** — for new rows it is server-set to `auth.uid()`, so all board grouping/ranking code keeps working unchanged. A new `profiles` table (keyed on `auth.uid()`) holds `display_name` plus `games_played / total_correct / total_cards` counters, incremented on every posted game via an atomic RPC. The public board view joins `profiles` so a name change reflects everywhere via `coalesce(profile.display_name, leaderboard.name)`. When a logged-in player finishes a game, the score posts automatically (no name prompt); the prompt appears only once, when the anonymous account is first created.

**Tech Stack:** Supabase (Postgres, RLS, Edge Functions on Deno), `@supabase/supabase-js` v2 anonymous auth, React + Zustand, Vitest, Playwright.

**Scope note — what is NOT in Phase 1:** the profile UI (rename, link email/Google, sign in on a new device) is Phase 2; the stats display is Phase 3. This plan only establishes the identity + data capture so Phases 2/3 have something to build on.

**Known limitation (accepted):** stats are bumped when a score posts. Auto-save fires for logged-in players whose run produced a score (`score > 0`). A pure 0-correct game is not counted toward `games_played`. This is an accepted simplification for Phase 1.

---

## File Structure

- **Create** `supabase/migrations/0010_auth_identity.sql` — `profiles` table + counters, atomic `bump_profile_stats` RPC, recreated `leaderboard_top` view with the profile-name join. (Reuses the existing `device_id` column to hold `auth.uid()`; no leaderboard column/index changes.)
- **Modify** `supabase/functions/submit-score/index.ts` — verify JWT → `userId`; reject unauthenticated; set `device_id = userId`; accept/validate `cards`; call `bump_profile_stats` every post.
- **Rewrite** `src/leaderboard/identity.ts` — auth-based identity: `getUserId()` (read-only, cached) and `ensureUserId()` (signs in anonymously if needed). Removes `getDeviceId`/`DEVICE_ID_KEY`.
- **Modify** `src/leaderboard/identity.test.ts` — cover the new auth-based functions.
- **Modify** `src/leaderboard/types.ts` — `SubmitPayload`: drop `deviceId`, add `cards`.
- **Modify** `src/leaderboard/client.ts` — `submitScore`: `ensureUserId()` before invoke; send `cards`, drop `device_id`.
- **Modify** `src/leaderboard/client.test.ts` — update `submitScore` tests (mock identity, assert new body).
- **Modify** `src/ui/GameOverLeaderboard.tsx` — auto-post when a session exists and a stored name is valid; pass `cards` through; resolve own id from `getUserId`.
- **Modify** `src/ui/GameOver.tsx` — pass `cards={roundIndex + 1}` to `GameOverLeaderboard`.
- **Modify** `src/ui/StartModes.tsx` — `getDeviceId()` → `await getUserId()` in the standings/auto-advance effects.

---

## Task 1: Database migration — profiles, counters, RPC, view

**Files:**
- Create: `supabase/migrations/0010_auth_identity.sql`

> Edge Functions and migrations have no unit-test harness in this repo; verification is a SQL query run against the project after applying the migration.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0010_auth_identity.sql`:

```sql
-- Phase 1 of the auth identity work. Introduces a real per-player identity
-- (auth.uid()) and lifetime game counters, reusing the existing
-- leaderboard.device_id column to carry the uid for new rows.

-- 1. Player profile: one row per authenticated (incl. anonymous) user.
--    display_name is the single source of truth for the shown name; counters
--    accumulate over the player's lifetime (no per-game timestamps — by design).
create table if not exists public.profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 3 and 16),
  games_played  int  not null default 0,
  total_correct int  not null default 0,
  total_cards   int  not null default 0,
  created_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- A user may read and write ONLY their own profile (Phase 2 rename happens
-- client-side through this policy; the public board name is exposed via the
-- owner-run view below, not this table).
drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2. Atomic upsert+increment. SECURITY DEFINER so the Edge Function (service
--    role) calls it directly; increments cannot be expressed via the JS client's
--    .update(), hence an RPC. Called once per posted game.
create or replace function public.bump_profile_stats(
  p_user    uuid,
  p_name    text,
  p_correct int,
  p_cards   int
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.profiles (user_id, display_name, games_played, total_correct, total_cards)
  values (p_user, p_name, 1, greatest(p_correct, 0), greatest(p_cards, 0))
  on conflict (user_id) do update set
    display_name  = excluded.display_name,
    games_played  = public.profiles.games_played  + 1,
    total_correct = public.profiles.total_correct + excluded.total_correct,
    total_cards   = public.profiles.total_cards   + excluded.total_cards;
$$;

-- 3. Recreate the public board view so the displayed name follows the profile
--    (a Phase-2 rename reflects everywhere immediately). New rows carry the uid
--    in device_id; legacy rows carry an old localStorage id that matches no
--    profile, so coalesce falls back to their frozen leaderboard.name.
drop view if exists public.leaderboard_top;
create view public.leaderboard_top as
  select
    l.id,
    coalesce(p.display_name, l.name) as name,
    l.score, l.correct, l.mode_id, l.game_mode, l.device_id, l.country, l.created_at
  from public.leaderboard l
  left join public.profiles p on p.user_id::text = l.device_id;
grant select on public.leaderboard_top to anon, authenticated;
```

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP `apply_migration` tool (name `auth_identity`, the SQL above) against the project, or `supabase db push` if using the CLI.

- [ ] **Step 3: Verify schema and view**

Run via MCP `execute_sql` (or SQL editor):

```sql
-- profiles exists with the four expected columns + RLS on
select column_name from information_schema.columns
  where table_schema='public' and table_name='profiles'
  order by ordinal_position;
-- expect: user_id, display_name, games_played, total_correct, total_cards, created_at

-- RPC exists
select proname from pg_proc where proname = 'bump_profile_stats';
-- expect: bump_profile_stats

-- view still selects (anon-readable projection)
select * from public.leaderboard_top limit 1;
-- expect: no error; columns include name + device_id
```

Expected: all three queries succeed with the noted shapes.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0010_auth_identity.sql
git commit -m "feat(db): profiles table, stats RPC, profile-name board view"
```

---

## Task 2: Edge Function — verify JWT, set identity, bump stats

**Files:**
- Modify: `supabase/functions/submit-score/index.ts`

- [ ] **Step 1: Add `cards` validation and the `MAX_CARDS` bound**

In `supabase/functions/submit-score/index.ts`, add a constant next to the others (after `MAX_CORRECT`):

```ts
const MAX_CARDS = 200; // generous upper bound on cards faced in one 90s run
```

Add a validator near `validScore`:

```ts
function validCards(cards: unknown, correct: number): boolean {
  if (typeof cards !== 'number' || !Number.isInteger(cards)) return false;
  return cards >= correct && cards <= MAX_CARDS;
}
```

- [ ] **Step 2: Derive identity from the verified JWT (replaces trusting `device_id`)**

Remove the body-`device_id` block:

```ts
// DELETE these lines:
const rawDeviceId = body.device_id;
if (typeof rawDeviceId !== 'string' || !/^[0-9a-f-]{36}$/.test(rawDeviceId)) {
  return json({ ok: false, reason: 'device' }, 400);
}
const deviceId = rawDeviceId;
```

After the `supabase` service-role client is created (the `createClient(... SERVICE_ROLE_KEY ...)` call), insert:

```ts
const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim();
const { data: userData } = await supabase.auth.getUser(token);
const user = userData?.user;
if (!user) return json({ ok: false, reason: 'auth' }, 401);
const deviceId = user.id; // server-authoritative identity; not spoofable
```

> `deviceId` keeps its name so the rest of the function (and all board code) is unchanged — it now simply holds the verified `auth.uid()`.

- [ ] **Step 3: Validate `cards` and bump stats on every post**

After the `validScore` check and before the rate-limit query, add:

```ts
const cards = body.cards;
if (!validCards(cards, correct)) return json({ ok: false, reason: 'cards' }, 400);
```

Immediately before the `// One row per (mode_id, game_mode, device_id)` comment block, add the stats bump (runs for every accepted game, independent of whether it's a personal best):

```ts
await supabase.rpc('bump_profile_stats', {
  p_user: deviceId,
  p_name: name,
  p_correct: correct,
  p_cards: cards as number,
});
```

- [ ] **Step 4: Deploy the function**

Deploy via Supabase MCP `deploy_edge_function` (slug `submit-score`) or `supabase functions deploy submit-score`.

- [ ] **Step 5: Verify rejection of unauthenticated calls**

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/submit-score" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Tester","score":900,"correct":9,"cards":12,"mode_id":"00000000-0000-0000-0000-000000000000"}'
```

Expected: JSON `{"ok":false,"reason":"auth"}` (the anon key alone is not a user). A real anonymous-user JWT would instead reach the mode check. This confirms the body can no longer spoof identity.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/submit-score/index.ts
git commit -m "feat(fn): derive submit identity from verified JWT, track game stats"
```

---

## Task 3: Auth-based identity module

**Files:**
- Rewrite: `src/leaderboard/identity.ts`
- Modify (tests): `src/leaderboard/identity.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `src/leaderboard/identity.test.ts` with:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/leaderboard/identity.test.ts`
Expected: FAIL — `getUserId`/`ensureUserId` are not exported (old module still exports `getDeviceId`).

- [ ] **Step 3: Rewrite the module**

Replace the entire contents of `src/leaderboard/identity.ts` with:

```ts
import { getSupabase } from '../supabase/client';

let cachedUserId: string | null = null;

/** The current player's auth id, or null if not signed in. Does not create a session. */
export async function getUserId(): Promise<string | null> {
  if (cachedUserId) return cachedUserId;
  const c = getSupabase();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  cachedUserId = data.session?.user?.id ?? null;
  return cachedUserId;
}

/** The current player's auth id, signing in anonymously if there is no session yet. */
export async function ensureUserId(): Promise<string | null> {
  const existing = await getUserId();
  if (existing) return existing;
  const c = getSupabase();
  if (!c) return null;
  const { data, error } = await c.auth.signInAnonymously();
  if (error || !data.user) return null;
  cachedUserId = data.user.id;
  return cachedUserId;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/leaderboard/identity.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/leaderboard/identity.ts src/leaderboard/identity.test.ts
git commit -m "feat: auth-based player identity (getUserId/ensureUserId)"
```

---

## Task 4: Submit payload + client `submitScore`

**Files:**
- Modify: `src/leaderboard/types.ts`
- Modify: `src/leaderboard/client.ts:183-198`
- Modify (tests): `src/leaderboard/client.test.ts:198-225`

- [ ] **Step 1: Update the payload type**

In `src/leaderboard/types.ts`, change `SubmitPayload` to drop `deviceId` and add `cards`:

```ts
export interface SubmitPayload {
  name: string;
  score: number;
  correct: number;
  cards: number;
  modeId: string;
  gameMode: RevealMode;
}
```

- [ ] **Step 2: Update the failing tests**

In `src/leaderboard/client.test.ts`, add an identity mock near the top mocks (after the `vi.mock('@supabase/supabase-js', ...)` block):

```ts
vi.mock('./identity', () => ({
  ensureUserId: vi.fn().mockResolvedValue('uid-1'),
  getUserId: vi.fn().mockResolvedValue('uid-1'),
}));
```

Replace the four tests in the `describe('submitScore', ...)` block (lines ~198-225) with:

```ts
describe('submitScore', () => {
  it('returns ok with id and rank on success', async () => {
    invoke.mockResolvedValueOnce({ data: { ok: true, id: 'x', rank: 7 }, error: null });
    const { submitScore } = await importClient();
    expect(await submitScore({ name: 'Al', score: 900, correct: 9, cards: 12, modeId: 'mode-uuid', gameMode: 'blur' })).toEqual({ ok: true, id: 'x', rank: 7 });
  });
  it('returns a reason on function error', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { message: 'rate-limited' } });
    const { submitScore } = await importClient();
    expect(await submitScore({ name: 'Al', score: 900, correct: 9, cards: 12, modeId: 'mode-uuid', gameMode: 'blur' })).toEqual({ ok: false, reason: 'rate-limited' });
  });
  it('returns a reason when the function rejects the payload', async () => {
    invoke.mockResolvedValueOnce({ data: { ok: false, reason: 'score' }, error: null });
    const { submitScore } = await importClient();
    expect(await submitScore({ name: 'Al', score: 1, correct: 9, cards: 12, modeId: 'mode-uuid', gameMode: 'blur' })).toEqual({ ok: false, reason: 'score' });
  });
  it('sends name, score, correct, cards, mode_id, game_mode and NOT device_id', async () => {
    invoke.mockResolvedValueOnce({ data: { ok: true, id: 'x', rank: 1 }, error: null });
    const { submitScore } = await importClient();
    await submitScore({ name: 'Al', score: 900, correct: 9, cards: 12, modeId: 'mode-uuid', gameMode: 'blur' });
    expect(invoke).toHaveBeenCalledWith('submit-score', {
      body: expect.objectContaining({ name: 'Al', score: 900, correct: 9, cards: 12, mode_id: 'mode-uuid', game_mode: 'blur' }),
    });
    expect(invoke).toHaveBeenCalledWith('submit-score', {
      body: expect.not.objectContaining({ device_id: expect.anything() }),
    });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/leaderboard/client.test.ts -t submitScore`
Expected: FAIL — current `submitScore` still sends `device_id` and has no `cards`.

- [ ] **Step 4: Update `submitScore`**

In `src/leaderboard/client.ts`, add the identity import at the top alongside the existing imports:

```ts
import { ensureUserId } from './identity';
```

Replace the `submitScore` function body (lines ~183-198) with:

```ts
export async function submitScore(payload: SubmitPayload): Promise<SubmitResult> {
  const c = getSupabase();
  if (!c) return { ok: false, reason: 'disabled' };
  // Ensure a session exists so supabase-js attaches the user JWT to the invoke.
  const uid = await ensureUserId();
  if (!uid) return { ok: false, reason: 'auth' };
  const body = {
    name: payload.name,
    score: payload.score,
    correct: payload.correct,
    cards: payload.cards,
    mode_id: payload.modeId,
    game_mode: payload.gameMode,
  };
  const { data, error } = await c.functions.invoke('submit-score', { body });
  if (error) return { ok: false, reason: error.message };
  if (!data || data.ok !== true) return { ok: false, reason: data?.reason ?? 'rejected' };
  return { ok: true, id: data.id, rank: data.rank };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/leaderboard/client.test.ts`
Expected: PASS (all client tests, including the rewritten submit block).

- [ ] **Step 6: Commit**

```bash
git add src/leaderboard/types.ts src/leaderboard/client.ts src/leaderboard/client.test.ts
git commit -m "feat: submitScore uses auth session + sends cards, drops device_id"
```

---

## Task 5: StartModes — use auth id for standings

**Files:**
- Modify: `src/ui/StartModes.tsx:204,215`

- [ ] **Step 1: Swap the identity import**

In `src/ui/StartModes.tsx`, change the import on line 7:

```ts
import { getUserId } from '../leaderboard/identity';
```

- [ ] **Step 2: Await the id in both effects**

`getUserId()` is now async. At line ~204 (inside the auto-advance effect) replace:

```ts
const target = await fetchAutoAdvanceTarget(modes.map((m) => m.id), getDeviceId(), enabled);
```

with:

```ts
const uid = await getUserId();
if (!uid) return;
const target = await fetchAutoAdvanceTarget(modes.map((m) => m.id), uid, enabled);
```

At line ~215 (the standings effect) replace:

```ts
const device = getDeviceId();
```

with:

```ts
const device = await getUserId();
if (!device) return;
```

> Both effects already run inside `async` IIFEs, so `await` is in scope. A brand-new visitor with no session simply shows no personal standing — correct, since they have no scores.

- [ ] **Step 3: Verify the build typechecks**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: PASS — no references to the removed `getDeviceId` remain.

- [ ] **Step 4: Commit**

```bash
git add src/ui/StartModes.tsx
git commit -m "feat: StartModes standings keyed on auth id"
```

---

## Task 6: GameOver — pass cards faced

**Files:**
- Modify: `src/ui/GameOver.tsx:15-25,117-124`

- [ ] **Step 1: Select the round index**

In `src/ui/GameOver.tsx`, add a selector alongside the others (after line 22, `const gameMode = ...`):

```ts
const roundIndex = useGameStore((s) => s.roundIndex);
```

- [ ] **Step 2: Pass `cards` to the board**

In the `<GameOverLeaderboard ... />` element (lines ~117-124) add the `cards` prop:

```tsx
<GameOverLeaderboard
  score={totalScore}
  correct={correctCount}
  cards={roundIndex + 1}
  modeId={currentModeId}
  modeName={currentModeName ?? undefined}
  modeFilter={currentModeFilter ?? undefined}
  gameMode={gameMode}
/>
```

> `roundIndex` is the 0-based index of the last card reached, so `roundIndex + 1` is the number of cards the player faced — the denominator for hit-rate. (Accepted: it may over-count by one when the 90s clock ends mid-card; negligible for an average.)

- [ ] **Step 3: Commit (after Task 7 makes the prop exist)**

This file won't typecheck until Task 7 adds the `cards` prop to `GameOverLeaderboard`. Do Task 7, then commit both together (see Task 7, Step 4).

---

## Task 7: GameOverLeaderboard — auto-save when logged in

**Files:**
- Modify: `src/ui/GameOverLeaderboard.tsx`

- [ ] **Step 1: Add the `cards` prop and identity import**

In `src/ui/GameOverLeaderboard.tsx`, change the identity import on line 11:

```ts
import { getUserId, ensureUserId } from '../leaderboard/identity';
```

Add `cards` to the component props (the `{ score, correct, modeId, ... }` destructure and its type):

```tsx
export function GameOverLeaderboard({
  score,
  correct,
  cards,
  modeId,
  modeName,
  modeFilter,
  gameMode,
}: {
  score: number;
  correct: number;
  cards: number;
  modeId: string | null;
  modeName?: string;
  modeFilter?: CustomFilter;
  gameMode: RevealMode;
}) {
```

- [ ] **Step 2: Track the player's own id in state (replaces sync `getDeviceId`)**

Add a state hook next to the others (after `const [nameError, ...]`):

```tsx
const [myId, setMyId] = useState<string | null>(null);
useEffect(() => { getUserId().then(setMyId).catch(() => {}); }, []);
```

Replace the two `deviceId: getDeviceId()` usages in `youEntry` (line ~126) with `deviceId: myId ?? 'projected'`.

- [ ] **Step 3: Thread the id and `cards` through `post`, and auto-post when logged in**

In `post()`, replace the submit call (line ~103):

```ts
const res = await submitScore({ name: clean, score, correct, cards, modeId: resolvedModeId, gameMode });
```

(Note: `submitScore` now calls `ensureUserId()` internally, so the session is guaranteed before the invoke.)

After the existing `useEffect` that fetches projected rank + top (ends ~line 54), add an auto-post effect:

```tsx
// Logged-in players with a saved name post automatically — the name prompt is
// only for first-time players creating their anonymous account.
useEffect(() => {
  if (!enabled || score <= 0 || !modeId) return;
  let cancelled = false;
  (async () => {
    const uid = await getUserId();
    const savedName = sanitizeName(localStorage.getItem(NAME_KEY) ?? '');
    if (cancelled || !uid || !savedName) return; // first-timer → manual prompt
    setName(savedName);
    await post();
  })().catch(() => {});
  return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [enabled, modeId, score]);
```

> `post()` reads `name` from state; we set it to `savedName` first. `post()` already guards against double-sends via `status`, and re-renders won't re-run the effect (deps are stable for a given game-over screen).

- [ ] **Step 4: Verify typecheck and full unit suite**

Run: `npx tsc -p tsconfig.app.json --noEmit && npx vitest run`
Expected: PASS — no `getDeviceId` references remain; all unit tests green.

- [ ] **Step 5: Commit (Tasks 6 + 7 together)**

```bash
git add src/ui/GameOver.tsx src/ui/GameOverLeaderboard.tsx
git commit -m "feat: auto-post score for logged-in players, pass cards faced"
```

---

## Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the unit suite**

Run: `npx vitest run`
Expected: PASS — entire suite green.

- [ ] **Step 2: Run typecheck + build**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 3: Run e2e (golden path)**

Run: `npx playwright test`
Expected: PASS. The e2e env has no Supabase configured (`isLeaderboardEnabled()` is false), so auto-save never fires and the game flow is unchanged.

- [ ] **Step 4: Manual smoke test against a real Supabase project (preview)**

With `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` set and **Anonymous sign-ins enabled** in the Supabase dashboard (Authentication → Providers → Anonymous):

1. Play a game as a fresh visitor → at game over, the **name prompt appears once**; enter a name and post.
2. Verify in SQL: `select * from public.profiles;` → one row, `games_played = 1`, `total_correct`/`total_cards` populated.
3. Play a second game (same browser) → score **posts automatically**, no name prompt; `games_played` becomes 2.
4. Verify the board shows the profile name via the view: `select name, device_id from public.leaderboard_top order by created_at desc limit 3;` → newest row's `device_id` is a uuid and `name` equals the profile's `display_name`.

Expected: all four behaviours hold. (If anonymous sign-ins are not enabled in the dashboard, `ensureUserId` returns null and `submitScore` yields `{ ok:false, reason:'auth' }` — enabling the provider is a one-time dashboard step, not a code change.)

---

## Self-Review

**Spec coverage:**
- Anon login lazily on first submit → Task 3 (`ensureUserId`) + Task 4 (`submitScore` calls it) + Task 7 (manual flow first time, auto after).
- `submit-score` derives uid from verified JWT (fake-proof) → Task 2.
- `profiles` table + counters + name normalization via view → Task 1.
- Counters bumped every game → Task 1 RPC + Task 2 call.
- Clean cut for legacy device scores (no migration) → Task 1 view `coalesce` fallback; no leaderboard backfill.
- Auto-save when logged in → Task 7.
- Cards faced for hit-rate → Task 6 + Task 2 (`cards` validation/storage).
- Identity used for standings → Task 5.

**Placeholder scan:** No TBD/TODO; every code step has concrete code and exact commands.

**Type consistency:** `SubmitPayload` (Task 4) drops `deviceId`, adds `cards`; all `submitScore` callers updated (`GameOverLeaderboard` Task 7). `getUserId`/`ensureUserId` names match across identity module (Task 3), client (Task 4), StartModes (Task 5), GameOverLeaderboard (Task 7). RPC name `bump_profile_stats` matches between Task 1 (definition) and Task 2 (call). The reused `device_id` column holds `auth.uid()` consistently in Task 1 (view join) and Task 2 (write).
