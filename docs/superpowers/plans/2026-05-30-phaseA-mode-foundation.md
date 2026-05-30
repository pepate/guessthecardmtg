# Phase A — Mode Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. NOTE: subagents have NO network access — all Supabase Management-API SQL and edge-function deploys are done by the controller (lead), not subagents.

**Goal:** Generalize all play into one `mode` concept: rename `custom_mode`→`mode`, make Popular/All real builtin modes, add a `popular` filter dimension, collapse card-dealing into one filter-based RPC, and rebuild the leaderboard keyed purely by `mode_id` (existing scores wiped).

**Architecture:** A `mode` row (kind = builtin|custom|set) carries a canonical jsonb filter. The client always deals cards via `get_filtered_game_cards(filter, count)` and always submits scores with a `mode_id`. Popular = `{popular:true}`, All = `{}`, resolved at startup via `mode.slug`. `pool` survives only as a client-side label for local personal-bests and the share URL.

**Tech Stack:** Supabase Postgres (Management API), Deno edge functions, React + TS + Vite, Vitest.

**Environment:**
- Project ref `jgapiqpaeaslfpbgiptf`. SQL via Management API (controller only):
  `curl -s -X POST "https://api.supabase.com/v1/projects/jgapiqpaeaslfpbgiptf/database/query" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d @-` (use `dangerouslyDisableSandbox` — the sandbox blocks network).
- The deployed site is offline (repo private), so breaking DB changes are safe to apply live now.
- Work dir: `/home/pete/Schreibtisch/GuessTheCard/.worktrees/sets-release-year`.

---

### Task A1: `popular` filter dimension (TDD)  [subagent]

**Files:** `src/customModes/filter.ts` (still pre-rename here; A5 renames the dir), `src/customModes/filter.test.ts`

- [ ] **Step 1 — failing tests.** Append to `filter.test.ts`:
```ts
describe('popular dimension', () => {
  it('canonicalizes popular only when true, first key', () => {
    expect(canonicalizeFilter({ popular: true }).popular).toBe(true);
    expect(canonicalizeFilter({ popular: false }).popular).toBeUndefined();
    expect(Object.keys(canonicalizeFilter({ popular: true, cmc: { min: 1 } }))).toEqual(['popular', 'cmc']);
  });
  it('labels popular in the mode name', () => {
    expect(modeName({ popular: true })).toContain('Popular');
  });
});
```
- [ ] **Step 2 — run, see fail:** `npx vitest run src/customModes/filter.test.ts` → FAIL.
- [ ] **Step 3 — implement** in `filter.ts`:
  - Add `popular?: boolean;` as the FIRST field of `CustomFilter`.
  - In `canonicalizeFilter`, as the FIRST assignment after `const out: CustomFilter = {};`: `if (f.popular) out.popular = true;`
  - In `modeName`, after `const parts: string[] = [];` add: `if (f.popular) parts.push('Popular');`
- [ ] **Step 4 — run, see pass:** `npx vitest run src/customModes/filter.test.ts` then `npx vitest run` → all pass; `npm run typecheck` clean.
- [ ] **Step 5 — commit:** `git add src/customModes/filter.ts src/customModes/filter.test.ts && git commit -m "feat: popular filter dimension"`

---

### Task A2: Migration 0005 — rename + schema + unified dealer + leaderboard restructure  [controller writes & applies]

**Files:** create `supabase/migrations/0005_mode_foundation.sql`

- [ ] **Step 1 — author the migration** with this content:

```sql
-- Generalize custom_mode → mode. Add kind/slug. Unify card dealing. Rebuild the
-- leaderboard keyed purely by mode_id (existing scores wiped per product decision).

-- 1. Rename table + list view.
alter table public.custom_mode rename to mode;
drop view if exists public.custom_mode_list;

-- 2. Classify modes.
alter table public.mode add column kind text not null default 'custom'
  check (kind in ('builtin','custom','set'));
alter table public.mode add column slug text unique;

-- 3. Wipe + restructure the leaderboard around mode_id only.
delete from public.leaderboard;
alter table public.leaderboard drop constraint if exists leaderboard_pool_check;
alter table public.leaderboard drop constraint if exists leaderboard_mode_id_check;
alter table public.leaderboard drop column if exists pool;
alter table public.leaderboard alter column mode_id set not null;
drop view if exists public.leaderboard_top;
create view public.leaderboard_top as
  select id, name, score, correct, mode_id, country, created_at from public.leaderboard;
grant select on public.leaderboard_top to anon;

-- 4. mode_list view (replaces custom_mode_list), now exposing kind/slug.
create view public.mode_list as
  select m.id, m.name, m.filter, m.card_count, m.kind, m.slug, m.created_at,
         count(l.id) as entry_count
  from public.mode m left join public.leaderboard l on l.mode_id = m.id
  group by m.id;
grant select on public.mode_list to anon;

-- 5. count_filtered_cards: add the `popular` clause (omitted => no popularity filter).
create or replace function public.count_filtered_cards(p_filter jsonb)
returns int language plpgsql stable as $$
declare
  v_count int;
  v_colors text[] := coalesce(array(select jsonb_array_elements_text(p_filter#>'{colors,values}')), '{}');
  v_match  text := coalesce(p_filter#>>'{colors,match}', 'any');
  v_types  text[] := coalesce(array(select jsonb_array_elements_text(p_filter->'types')), '{}');
  v_sets   text[] := coalesce(array(select jsonb_array_elements_text(p_filter->'sets')), '{}');
  v_rar    text[] := coalesce(array(select jsonb_array_elements_text(p_filter->'rarities')), '{}');
  v_ub     text := p_filter->>'ub';
begin
  select count(*) into v_count
  from public.card c
  where (p_filter->>'popular' is null or c.is_popular)
    and (p_filter->'cmc'->>'min' is null or c.cmc >= (p_filter->'cmc'->>'min')::real)
    and (p_filter->'cmc'->>'max' is null or c.cmc <= (p_filter->'cmc'->>'max')::real)
    and (p_filter->'edhrec'->>'min' is null or (c.edhrec_rank is not null and c.edhrec_rank >= (p_filter->'edhrec'->>'min')::int))
    and (p_filter->'edhrec'->>'max' is null or (c.edhrec_rank is not null and c.edhrec_rank <= (p_filter->'edhrec'->>'max')::int))
    and (p_filter->'year'->>'min' is null or (c.released_at is not null and c.released_at >= make_date((p_filter->'year'->>'min')::int, 1, 1)))
    and (p_filter->'year'->>'max' is null or (c.released_at is not null and c.released_at < make_date((p_filter->'year'->>'max')::int + 1, 1, 1)))
    and (p_filter->'power'->>'min' is null or (c.power ~ '^[0-9]+$' and c.power::int >= (p_filter->'power'->>'min')::int))
    and (p_filter->'power'->>'max' is null or (c.power ~ '^[0-9]+$' and c.power::int <= (p_filter->'power'->>'max')::int))
    and (p_filter->'toughness'->>'min' is null or (c.toughness ~ '^[0-9]+$' and c.toughness::int >= (p_filter->'toughness'->>'min')::int))
    and (p_filter->'toughness'->>'max' is null or (c.toughness ~ '^[0-9]+$' and c.toughness::int <= (p_filter->'toughness'->>'max')::int))
    and (v_ub = 'yes' or (coalesce(v_ub, 'no') = 'no' and not c.is_ub) or (v_ub = 'only' and c.is_ub))
    and (cardinality(v_colors) = 0 or (
      (case when v_match = 'all'
            then c.colors @> (select array_agg(x) from unnest(v_colors) x where x <> 'C')
            else c.colors && (select array_agg(x) from unnest(v_colors) x where x <> 'C') end)
      or ('C' = any(v_colors) and (c.colors is null or cardinality(c.colors) = 0))))
    and (cardinality(v_types) = 0 or exists (select 1 from unnest(v_types) t where c.type_line ilike '%' || t || '%'))
    and (cardinality(v_sets) = 0 or exists (select 1 from public.card_art a where a.oracle_id = c.oracle_id and a.set_code = any(v_sets)))
    and (cardinality(v_rar) = 0 or exists (select 1 from public.card_art a where a.oracle_id = c.oracle_id and a.rarity = any(v_rar)));
  return v_count;
end; $$;
grant execute on function public.count_filtered_cards(jsonb) to anon, authenticated;

-- 6. get_filtered_game_cards: the single dealer. Same selection as count, plus the
-- lateral art-join restricted to matching set/rarity printings. Replaces
-- get_game_cards and get_mode_game_cards.
create or replace function public.get_filtered_game_cards(p_filter jsonb, p_count int)
returns table (
  oracle_id uuid, name text, cmc real, colors text[], color_identity text[],
  type_line text, power text, toughness text, rarity text, set_code text,
  set_name text, image_normal text, image_art_crop text
) language plpgsql stable as $$
declare
  v_colors text[] := coalesce(array(select jsonb_array_elements_text(p_filter#>'{colors,values}')), '{}');
  v_match  text := coalesce(p_filter#>>'{colors,match}', 'any');
  v_types  text[] := coalesce(array(select jsonb_array_elements_text(p_filter->'types')), '{}');
  v_sets   text[] := coalesce(array(select jsonb_array_elements_text(p_filter->'sets')), '{}');
  v_rar    text[] := coalesce(array(select jsonb_array_elements_text(p_filter->'rarities')), '{}');
  v_ub     text := p_filter->>'ub';
begin
  return query
  select c.oracle_id, c.name, c.cmc, c.colors, c.color_identity,
         c.type_line, c.power, c.toughness,
         a.rarity, a.set_code, a.set_name, a.image_normal, a.image_art_crop
  from (
    select * from public.card c
    where (p_filter->>'popular' is null or c.is_popular)
      and (p_filter->'cmc'->>'min' is null or c.cmc >= (p_filter->'cmc'->>'min')::real)
      and (p_filter->'cmc'->>'max' is null or c.cmc <= (p_filter->'cmc'->>'max')::real)
      and (p_filter->'edhrec'->>'min' is null or (c.edhrec_rank is not null and c.edhrec_rank >= (p_filter->'edhrec'->>'min')::int))
      and (p_filter->'edhrec'->>'max' is null or (c.edhrec_rank is not null and c.edhrec_rank <= (p_filter->'edhrec'->>'max')::int))
      and (p_filter->'year'->>'min' is null or (c.released_at is not null and c.released_at >= make_date((p_filter->'year'->>'min')::int, 1, 1)))
      and (p_filter->'year'->>'max' is null or (c.released_at is not null and c.released_at < make_date((p_filter->'year'->>'max')::int + 1, 1, 1)))
      and (p_filter->'power'->>'min' is null or (c.power ~ '^[0-9]+$' and c.power::int >= (p_filter->'power'->>'min')::int))
      and (p_filter->'power'->>'max' is null or (c.power ~ '^[0-9]+$' and c.power::int <= (p_filter->'power'->>'max')::int))
      and (p_filter->'toughness'->>'min' is null or (c.toughness ~ '^[0-9]+$' and c.toughness::int >= (p_filter->'toughness'->>'min')::int))
      and (p_filter->'toughness'->>'max' is null or (c.toughness ~ '^[0-9]+$' and c.toughness::int <= (p_filter->'toughness'->>'max')::int))
      and (v_ub = 'yes' or (coalesce(v_ub, 'no') = 'no' and not c.is_ub) or (v_ub = 'only' and c.is_ub))
      and (cardinality(v_colors) = 0 or (
        (case when v_match = 'all'
              then c.colors @> (select array_agg(x) from unnest(v_colors) x where x <> 'C')
              else c.colors && (select array_agg(x) from unnest(v_colors) x where x <> 'C') end)
        or ('C' = any(v_colors) and (c.colors is null or cardinality(c.colors) = 0))))
      and (cardinality(v_types) = 0 or exists (select 1 from unnest(v_types) t where c.type_line ilike '%' || t || '%'))
      and (cardinality(v_sets) = 0 or exists (select 1 from public.card_art a where a.oracle_id = c.oracle_id and a.set_code = any(v_sets)))
      and (cardinality(v_rar) = 0 or exists (select 1 from public.card_art a where a.oracle_id = c.oracle_id and a.rarity = any(v_rar)))
    order by random()
    limit least(greatest(p_count, 0), 500)
  ) c
  cross join lateral (
    select ca.rarity, ca.set_code, ca.set_name, ca.image_normal, ca.image_art_crop
    from public.card_art ca
    where ca.oracle_id = c.oracle_id
      and (cardinality(v_sets) = 0 or ca.set_code = any(v_sets))
      and (cardinality(v_rar) = 0 or ca.rarity = any(v_rar))
    order by random() limit 1
  ) a;
end; $$;
grant execute on function public.get_filtered_game_cards(jsonb, int) to anon, authenticated;

-- 7. Drop the superseded dealers.
drop function if exists public.get_game_cards(text, int);
drop function if exists public.get_mode_game_cards(uuid, int);
```

- [ ] **Step 2 — apply** via Management API (controller, sandbox disabled): post the file as the query. Verify response has no `"error"`.
- [ ] **Step 3 — verify schema:** run and confirm:
  - `select count(*) from information_schema.tables where table_schema='public' and table_name='mode';` → 1
  - `select count(*) from information_schema.columns where table_schema='public' and table_name='leaderboard' and column_name='pool';` → 0
  - `select public.get_filtered_game_cards('{"popular":true}'::jsonb, 5);` → returns ≤5 popular rows.
  - `select public.count_filtered_cards('{}'::jsonb) as all_count, public.count_filtered_cards('{"popular":true}'::jsonb) as popular_count;` → all_count is the full eligible pool (compare to the old `get_game_cards('all')` expectation), popular_count ≈ the popular subset.
- [ ] **Step 4 — commit:** `git add supabase/migrations/0005_mode_foundation.sql && git commit -m "feat: rename custom_mode->mode, kind/slug, unified dealer, mode_id-only leaderboard"`

---

### Task A3: Seed builtin modes (Popular, All)  [controller, network]

- [ ] **Step 1 — compute hashes** matching the client (`filterHash(canonicalizeFilter(...))` = hex sha256 of the canonical JSON string):
  - All: canonical `{}` → `printf '%s' '{}' | sha256sum`
  - Popular: canonical `{"popular":true}` → `printf '%s' '{"popular":true}' | sha256sum`
- [ ] **Step 2 — compute card_count** for each via `count_filtered_cards`.
- [ ] **Step 3 — insert** the two builtin rows (controller, sandbox off):
```sql
insert into public.mode (name, filter, filter_hash, card_count, kind, slug) values
  ('All cards',     '{}'::jsonb,               '<hash_all>',     <all_count>,     'builtin', 'all'),
  ('Popular cards', '{"popular":true}'::jsonb, '<hash_popular>', <popular_count>, 'builtin', 'popular')
on conflict (slug) do nothing;
```
- [ ] **Step 4 — verify:** `select slug, name, card_count, kind from public.mode where kind='builtin';` → two rows.
- [ ] (No commit — data only.)

---

### Task A4: Edge functions  [subagent writes; controller deploys]

**Files:** `supabase/functions/create-mode/index.ts`, `supabase/functions/submit-score/index.ts`

- [ ] **Step 1 — subagent edits:**
  - `create-mode`: change the target table `custom_mode`→`mode`; when inserting, set `kind`: compute from the filter — if the filter has exactly the single key `sets` with a one-element array, `kind='set'`, else `kind='custom'`. Keep the ≥-cards gate value at 100 for now (Phase C lowers to 50). Dedup by `filter_hash` unchanged.
  - `submit-score`: require `mode_id` (reject if missing); drop all `pool` handling; insert `{ name, score, correct, mode_id, country }`.
- [ ] **Step 2 — typecheck note:** these are Deno functions (not in the vite build). The subagent verifies by reading for obvious type/logic errors; the controller deploys & smoke-tests.
- [ ] **Step 3 — commit** (subagent): `git add supabase/functions && git commit -m "feat: edge functions write mode table + mode_id-only scores"`
- [ ] **Step 4 — deploy** (controller): deploy both functions to the project and smoke-test create-mode with a throwaway filter (then delete that test mode).

---

### Task A5: Rename code dir `src/customModes` → `src/modes`  [subagent]

- [ ] **Step 1:** `git mv src/customModes src/modes` (moves filter.ts, client.ts, types.ts, filter.test.ts).
- [ ] **Step 2:** update every import path `../customModes/x`/`./customModes/x` → `modes` across `src` (the importing files: `src/cards/client.ts`, `src/scryfall/types.ts`, `src/ui/CustomModeBrowser.tsx`, `src/ui/CustomModeBuilder.tsx`, `src/ui/CustomModeDetail.tsx`, `src/ui/FilterChips.tsx`, plus any inside the moved dir). Use a grep to find all and edit.
- [ ] **Step 3:** `npm run typecheck` clean; `npx vitest run` all pass.
- [ ] **Step 4 — commit:** `git add -A && git commit -m "refactor: rename customModes module to modes"`

---

### Task A6: Frontend mode-id refactor  [subagent; controller reviews carefully]

**Files:** `src/leaderboard/client.ts`, `src/leaderboard/types.ts`, `src/leaderboard/useLeaderboard.ts`, `src/state/gameStore.ts`, `src/state/highscores.ts`, `src/cards/client.ts`, `src/ui/GameOver.tsx`, `src/ui/GameOverLeaderboard.tsx`, `src/modes/client.ts`

- [ ] **Step 1 — leaderboard becomes mode-id-only.** In `leaderboard/types.ts` drop `pool` from `GlobalEntry`/`SubmitPayload`; make `modeId` required on `SubmitPayload`. In `leaderboard/client.ts` remove `fetchTopScores(pool)`/`fetchProjectedRank(pool)` (pool-based) — keep only `fetchModeTopScores(modeId)`/`fetchModeProjectedRank(modeId)`/`submitScore({modeId,...})`; all read `leaderboard_top` filtered by `mode_id`. Update `useLeaderboard.ts` to take a `modeId`.
- [ ] **Step 2 — builtin resolution.** In `src/modes/client.ts` add `getBuiltinModes(): Promise<{popular: CustomMode; all: CustomMode}>` reading `mode` where `slug in ('popular','all')`. In `gameStore`, on app/start-screen init, load builtin modes and cache them; the Popular/All buttons select the corresponding builtin mode (set `currentModeId`, `currentModeName`, `filter`, and a client-side `poolKind` label of `'popular'`/`'all'` for share/local).
- [ ] **Step 3 — deal by filter.** `cards/client.ts`: replace `get_game_cards`/`get_mode_game_cards` calls with `get_filtered_game_cards(filter, count)`. `gameStore.fetchCandidates` passes the current mode's filter.
- [ ] **Step 4 — game over.** `GameOver`/`GameOverLeaderboard` already pass `modeId`; ensure every game now has a `modeId` (builtin/custom). Submit always includes `modeId`. Keep the `pool` label only for the share text + local highscore.
- [ ] **Step 5 — local/share keep pool.** `highscores.ts` and `share/score.ts` unchanged (still keyed by `PoolKind`); sets/custom map to `'custom'` for those client-only concerns.
- [ ] **Step 6 — verify:** `npm run build` and `npx vitest run` pass; fix any tests that referenced removed pool-based fetchers (update to mode-based or builtin-mode-id).
- [ ] **Step 7 — commit:** `git add -A && git commit -m "refactor: leaderboard + game flow keyed by mode_id; classic pools via builtin modes"`

---

### Task A7: Verification  [controller]

- [ ] `npm run build` + `npx vitest run` green.
- [ ] Live RPC: `get_filtered_game_cards` for `{}`, `{popular:true}`, a `{sets:[code]}`; counts sane.
- [ ] Browser walkthrough (preview server on the worktree): Popular and All both deal cards and post a score to their builtin-mode board; the start-screen leaderboard reads the right board; Custom Mode still creates+plays (now writes `mode`/`kind='custom'`). Delete any test data created.
- [ ] Hand off to Phase B.

---

## Notes
- The migration is breaking and destructive (drops `pool`, wipes scores) — intentional; the site is offline.
- After A2 the old dealers are gone; nothing may call `get_game_cards`/`get_mode_game_cards` after A6.
- `create-mode`'s ≥100 gate stays until Phase C lowers it to 50.
