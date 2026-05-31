# Modes-Only Redesign — Phase 1: Identity + Data — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every player a stable anonymous device-ID, re-key the leaderboard around `(mode_id, game_mode, device_id)`, enforce the rank-1 lockout server-side, and seed three starter modes.

**Architecture:** A frontend identity helper persists a UUID in localStorage and sends it with every score. Migration `0009` adds a `device_id` column (backfilling legacy rows), swaps the dedup unique index from name-based to device-based, exposes `device_id` through the read view, and seeds three modes. The `submit-score` edge function dedupes by device and rejects any submission to a `(mode, reveal_mode)` board where the device is already rank 1.

**Tech Stack:** TypeScript, Vite, Vitest, React, Supabase (Postgres + Deno edge functions). Build: `npm run build`. Tests: `npm test` (vitest).

**Spec:** `docs/superpowers/specs/2026-05-31-modes-only-redesign-design.md`

---

## File Structure

- Create `src/leaderboard/identity.ts` — device-ID generation/read (one responsibility: stable anonymous identity).
- Create `src/leaderboard/identity.test.ts` — unit tests for the helper.
- Create `supabase/migrations/0009_device_identity.sql` — column + backfill + index swap + view + seeds.
- Modify `supabase/functions/submit-score/index.ts` — accept `device_id`, dedup by device, server-side rank-1 rejection.
- Modify `src/leaderboard/types.ts` — add `deviceId` to `SubmitPayload`.
- Modify `src/leaderboard/client.ts` — send `device_id` in the submit body.
- Modify `src/leaderboard/client.test.ts` — assert `device_id` is sent.

---

## Task 1: Device-ID identity helper

**Files:**
- Create: `src/leaderboard/identity.ts`
- Test: `src/leaderboard/identity.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/leaderboard/identity.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getDeviceId, DEVICE_ID_KEY } from './identity';

beforeEach(() => localStorage.clear());

describe('getDeviceId', () => {
  it('generates a uuid and persists it', () => {
    const id = getDeviceId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(localStorage.getItem(DEVICE_ID_KEY)).toBe(id);
  });

  it('returns the same id on repeat calls', () => {
    const first = getDeviceId();
    const second = getDeviceId();
    expect(second).toBe(first);
  });

  it('reuses an already-stored id', () => {
    localStorage.setItem(DEVICE_ID_KEY, '11111111-1111-4111-8111-111111111111');
    expect(getDeviceId()).toBe('11111111-1111-4111-8111-111111111111');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/leaderboard/identity.test.ts`
Expected: FAIL — cannot resolve `./identity`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/leaderboard/identity.ts
export const DEVICE_ID_KEY = 'guessthecard.deviceid';

/** Stable anonymous identity for this browser. Generated once, then reused. */
export function getDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing && /^[0-9a-f-]{36}$/.test(existing)) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/leaderboard/identity.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/leaderboard/identity.ts src/leaderboard/identity.test.ts
git commit -m "feat: anonymous device-id identity helper"
```

---

## Task 2: Add deviceId to the submit payload type and client

**Files:**
- Modify: `src/leaderboard/types.ts`
- Modify: `src/leaderboard/client.ts:80-86` (the `body` object in `submitScore`)
- Modify: `src/leaderboard/client.test.ts`

- [ ] **Step 1: Update the failing test first**

In `src/leaderboard/client.test.ts`, change the "sends mode_id and game_mode" test to also assert `device_id`, and add `deviceId` to every `submitScore({...})` call in that file. Replace the existing test at lines 139-149 with:

```typescript
  it('sends mode_id, game_mode and device_id (not pool) in the request body', async () => {
    invoke.mockResolvedValueOnce({ data: { ok: true, id: 'x', rank: 1 }, error: null });
    const { submitScore } = await importClient();
    await submitScore({ name: 'Al', score: 900, correct: 9, modeId: 'mode-uuid', gameMode: 'blur', deviceId: 'dev-1' });
    expect(invoke).toHaveBeenCalledWith('submit-score', {
      body: expect.objectContaining({ mode_id: 'mode-uuid', game_mode: 'blur', device_id: 'dev-1' }),
    });
    expect(invoke).toHaveBeenCalledWith('submit-score', {
      body: expect.not.objectContaining({ pool: expect.anything() }),
    });
  });
```

Also update the three earlier `submitScore` calls in the `submitScore` describe block (lines 127, 132, 137) to append `, deviceId: 'dev-1'` inside each payload object.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/leaderboard/client.test.ts`
Expected: FAIL — `device_id` missing from the invoked body, and `SubmitPayload` has no `deviceId` (type error surfaces at build).

- [ ] **Step 3: Add `deviceId` to `SubmitPayload`**

In `src/leaderboard/types.ts`, replace the `SubmitPayload` interface with:

```typescript
export interface SubmitPayload {
  name: string;
  score: number;
  correct: number;
  modeId: string;
  gameMode: RevealMode;
  deviceId: string;
}
```

- [ ] **Step 4: Send `device_id` in the client body**

In `src/leaderboard/client.ts`, replace the `body` object inside `submitScore` (lines 80-86) with:

```typescript
  const body = {
    name: payload.name,
    score: payload.score,
    correct: payload.correct,
    mode_id: payload.modeId,
    game_mode: payload.gameMode,
    device_id: payload.deviceId,
  };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/leaderboard/client.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/leaderboard/types.ts src/leaderboard/client.ts src/leaderboard/client.test.ts
git commit -m "feat: carry device_id in submit-score payload"
```

> NOTE: `GameOverLeaderboard.tsx` calls `submitScore` without `deviceId` and will now fail type-check. That call site is updated in Phase 3 (UI). To keep `main` green between phases, also patch the call site now: in `src/ui/GameOverLeaderboard.tsx`, import `getDeviceId` from `../leaderboard/identity` and add `deviceId: getDeviceId()` to the `submitScore({...})` argument. Update the matching expectation in `src/ui/GameOverLeaderboard.test.tsx` (the `toHaveBeenCalledWith` for submitScore) to include `deviceId: expect.any(String)`. Include these two edits in this commit.

---

## Task 3: Migration 0009 — device_id column, index swap, view, seeds

**Files:**
- Create: `supabase/migrations/0009_device_identity.sql`

This task has no unit test (no SQL harness in repo, consistent with `0008`). Verification is by read-only preview against the live DB before applying, mirroring how `0008` was deployed.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0009_device_identity.sql
-- Re-key the leaderboard around an anonymous device_id and seed starter modes.

-- 1. device_id column. Backfill legacy rows so no historical score is lost.
alter table public.leaderboard add column if not exists device_id text;
update public.leaderboard set device_id = 'legacy:' || name where device_id is null;
alter table public.leaderboard alter column device_id set not null;

-- 2. Collapse any pre-existing duplicates to the single best run per
--    (mode_id, game_mode, device_id) before enforcing the new uniqueness.
--    "Best" = highest score, then newest, then larger id.
delete from public.leaderboard a
using public.leaderboard b
where a.mode_id = b.mode_id
  and coalesce(a.game_mode, '') = coalesce(b.game_mode, '')
  and a.device_id = b.device_id
  and (
    b.score > a.score
    or (b.score = a.score and b.created_at > a.created_at)
    or (b.score = a.score and b.created_at = a.created_at and b.id > a.id)
  );

-- 3. Swap the dedup uniqueness from name-based (0008) to device-based.
drop index if exists public.leaderboard_person_mode_uniq;
create unique index if not exists leaderboard_device_mode_uniq
  on public.leaderboard (mode_id, coalesce(game_mode, ''), device_id);

-- 4. Recreate the public read view to expose device_id (needed for standing
--    and rank-1 lockout). mode_id-keyed, no pool.
drop view if exists public.leaderboard_top;
create view public.leaderboard_top as
  select id, name, score, correct, mode_id, game_mode, device_id, country, created_at
  from public.leaderboard;
grant select on public.leaderboard_top to anon;

-- 5. Seed three starter modes. Idempotent on filter_hash. card_count is computed
--    from the live card pool. filter_hash values are the SHA-256 of the canonical
--    filter JSON produced by src/modes/filter.ts canonicalizeFilter (see Step 2).
insert into public.mode (name, filter, filter_hash, card_count, kind, slug)
values
  ('Top 100 EDHRec',  '{"edhrec":{"max":100}}'::jsonb,            '__HASH_TOP100__',  public.count_filtered_cards('{"edhrec":{"max":100}}'::jsonb),  'custom', 'seed-top100-edhrec'),
  ('Top 1000 EDHRec', '{"edhrec":{"max":1000}}'::jsonb,           '__HASH_TOP1000__', public.count_filtered_cards('{"edhrec":{"max":1000}}'::jsonb), 'custom', 'seed-top1000-edhrec'),
  ('Simic','{"colors":{"match":"all","values":["G","U"]}}'::jsonb, '__HASH_SIMIC__', public.count_filtered_cards('{"colors":{"match":"all","values":["G","U"]}}'::jsonb), 'custom', 'seed-simic')
on conflict (filter_hash) do nothing;
```

> The canonical JSON shapes above match `canonicalizeFilter`: object keys inserted in fixed order, `colors.values` sorted (`['G','U']`), empties dropped. `modeName` produces "Top 100 EDHRec"-style names only for edhrec via the `EDH ≤100` label, so the seed names are set explicitly here to match the product copy.

- [ ] **Step 2: Compute the three filter_hash values**

The seed `filter_hash` must equal what `filterHash(canonicalizeFilter(f))` yields, so a user later building the same filter dedupes onto the seed. Compute them with a one-off Node snippet using the repo's own canonicalizer:

Run:
```bash
node --input-type=module -e '
import { filterHash } from "./src/modes/filter.ts";
for (const f of [{edhrec:{max:100}},{edhrec:{max:1000}},{colors:{values:["G","U"],match:"all"}}]) {
  console.log(JSON.stringify(f), await filterHash(f));
}
' 2>/dev/null || npx tsx -e '
import { filterHash } from "./src/modes/filter.ts";
for (const f of [{edhrec:{max:100}},{edhrec:{max:1000}},{colors:{values:["G","U"],match:"all"}}]) {
  console.log(JSON.stringify(f), await filterHash(f));
}
'
```
Expected: three `<filter> <64-hex>` lines. Substitute each hex into the migration, replacing `__HASH_TOP100__`, `__HASH_TOP1000__`, `__HASH_SIMIC__` respectively.

- [ ] **Step 3: Preview impact against the live DB (read-only) before applying**

Run (via the Supabase Management API or `mcp__supabase__execute_sql` with the project's token), confirm counts look sane:
```sql
select count(*) as total, count(*) filter (where device_id is null) as missing_device
from public.leaderboard;
select count(*) from public.mode where slug like 'seed-%';
```
Expected: small `total` (≈5), `missing_device` = total (column not added yet → query the pre-migration shape: just `select count(*) from public.leaderboard`). No seed rows yet.

- [ ] **Step 4: Apply the migration**

Apply `0009_device_identity.sql` via `mcp__supabase__apply_migration` (name: `device_identity`) or the Management API, against project `jgapiqpaeaslfpbgiptf`.

- [ ] **Step 5: Verify post-apply**

Run:
```sql
select indexname from pg_indexes where tablename = 'leaderboard' and indexname in ('leaderboard_device_mode_uniq','leaderboard_person_mode_uniq');
select name, card_count, slug from public.mode where slug like 'seed-%' order by slug;
select column_name from information_schema.columns where table_name='leaderboard_top' and column_name='device_id';
```
Expected: only `leaderboard_device_mode_uniq` present; three seed rows with non-zero `card_count`; `device_id` exposed by the view.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0009_device_identity.sql
git commit -m "feat: migration 0009 — device-id leaderboard key + seed modes"
```

---

## Task 4: submit-score — store device_id, dedup by device, reject rank-1 resubmits

**Files:**
- Modify: `supabase/functions/submit-score/index.ts`

The edge function is tested by deploy + live verification (no Deno test harness in repo, consistent with prior deploys). Logic changes are below as exact replacements.

- [ ] **Step 1: Validate and read device_id from the body**

After the `name`/`score`/`correct` validation block (after current line 84), insert:

```typescript
  const rawDeviceId = body.device_id;
  if (typeof rawDeviceId !== 'string' || !/^[0-9a-f-]{36}$/.test(rawDeviceId)) {
    return json({ ok: false, reason: 'device' }, 400);
  }
  const deviceId = rawDeviceId;
```

- [ ] **Step 2: Key the existing-row lookup on device_id instead of name**

Replace the existing-row query block (current lines 118-124) with:

```typescript
  // One row per (mode_id, game_mode, device_id): keep this device's best run in
  // each reveal mode. Boards are per (mode, reveal_mode); the display name is
  // whatever the device last submitted.
  let existingQ = supabase
    .from('leaderboard')
    .select('id,score')
    .eq('mode_id', modeId)
    .eq('device_id', deviceId);
  existingQ = gameMode === null ? existingQ.is('game_mode', null) : existingQ.eq('game_mode', gameMode);
  const existing = await existingQ.order('score', { ascending: false }).limit(1).maybeSingle();
```

- [ ] **Step 3: Enforce rank-1 lockout server-side**

Before the insert/update branch (immediately before current line 126 `let rowId: string;`), insert a guard that rejects when this device is already the sole top scorer in this `(mode, reveal_mode)` board:

```typescript
  // Rank-1 lockout: a device that already holds the top score in this exact
  // (mode, reveal_mode) board may not play it again — give others a chance.
  let lockQ = supabase
    .from('leaderboard')
    .select('device_id,score')
    .eq('mode_id', modeId);
  lockQ = gameMode === null ? lockQ.is('game_mode', null) : lockQ.eq('game_mode', gameMode);
  const board = await lockQ.order('score', { ascending: false }).limit(1).maybeSingle();
  if (board.data && board.data.device_id === deviceId) {
    return json({ ok: false, reason: 'rank-1-locked' }, 409);
  }
```

- [ ] **Step 4: Include device_id in insert; keep update keyed by row id**

Replace the insert payload (current line 130) so it stores device_id:

```typescript
      .insert({ name, score, correct, mode_id: modeId, game_mode: gameMode, device_id: deviceId, country, ip_hash: ipHash })
```

The update branch already targets `existing.data.id`; also refresh the stored display name so the latest name shows. Replace the update payload (current line 138) with:

```typescript
      .update({ name, score, correct, country, ip_hash: ipHash, created_at: new Date().toISOString() })
```

- [ ] **Step 5: Rank by distinct device, not name**

Replace the final ranking block (current lines 149-160) with:

```typescript
  // Rank by distinct device (each device's best score for this mode), not raw rows.
  const all = await supabase.from('leaderboard').select('device_id,score').eq('mode_id', modeId);
  const bestByDevice = new Map<string, number>();
  for (const r of (all.data ?? []) as { device_id: string; score: number }[]) {
    const prev = bestByDevice.get(r.device_id);
    if (prev === undefined || r.score > prev) bestByDevice.set(r.device_id, r.score);
  }
  const myBest = bestByDevice.get(deviceId) ?? score;
  let higher = 0;
  for (const [otherDevice, otherScore] of bestByDevice) {
    if (otherDevice !== deviceId && otherScore > myBest) higher++;
  }
```

- [ ] **Step 6: Deploy the function**

Run:
```bash
npx --yes supabase@latest functions deploy submit-score --project-ref jgapiqpaeaslfpbgiptf --use-api
```
Expected: deploy succeeds.

- [ ] **Step 7: Live verify**

Using a seed mode id (from Task 3 Step 5) and a throwaway `device_id`, POST a valid score, then POST again with a *lower* score for the same device/mode/reveal — first returns `{ok:true}`, repeat keeps the best. Then POST a *higher* score from the *same* device when it is already rank 1 → expect `409 {reason:'rank-1-locked'}`. Use `mcp__supabase__get_logs` if a call fails.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/submit-score/index.ts
git commit -m "feat: submit-score keys on device_id + server-side rank-1 lockout"
```

---

## Phase 1 Done — verify the whole repo

- [ ] **Run the full suite + build**

Run: `npm run build && npm test`
Expected: build passes (no type errors from the `SubmitPayload`/call-site changes), all vitest suites green.

- [ ] **Final commit if anything was left unstaged**

```bash
git status
```

---

## Self-Review notes (already applied)

- **Spec coverage:** identity (§Identity), device-keyed dedup (§Leaderboard model), server-side rank-1 lockout (§Rank-1 lockout + §Error handling), seeded modes (§Seeded modes), legacy backfill (Decision A). Board *read-path* rework, start screen, picker, deeplinks, and auto-advance are intentionally deferred to Phases 2-4.
- **No placeholders:** the only literal placeholders are the three `__HASH_*__` tokens, which Task 3 Step 2 computes and substitutes before applying — not left for the implementer to invent.
- **Type consistency:** `deviceId` on `SubmitPayload`, `device_id` in the client body and edge function, `getDeviceId()` name used consistently across Tasks 1, 2, and the GameOverLeaderboard patch.
