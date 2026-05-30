# Modes Unification & Sets Area — Design

**Date:** 2026-05-30
**Builds on:** the Custom Mode feature + the in-progress sets-release-year branch (year filter, UB-default flip, `card_set` table + backfilled `card.released_at`).

## Goal

1. Generalize everything into one **`mode`** concept: the two "classic" pools (Popular, All) become real mode rows, alongside custom modes and per-set modes. Rename `custom_mode`→`mode`, `custom_mode_list`→`mode_list`.
2. Remove the set picker from the Custom Mode builder (Custom Mode = a pure filter config).
3. Add a dedicated **Sets** area (its own start-screen button): a leaderboard-style list of *played* sets + a search dropdown over *all* qualifying sets, each launchable; sets are created lazily on first score submission.
4. Lay groundwork to feature top modes on the start page later.

**All existing leaderboard data is wiped** as part of this work (user decision), so there is no `pool→mode_id` migration — the leaderboard is rebuilt keyed purely by `mode_id`.

## Phasing

- **Phase A — Mode foundation:** rename + classic-modes-as-modes + leaderboard restructure + `popular` filter dimension + unified card-dealing RPC.
- **Phase B — Custom Mode slim-down:** remove the set picker from the builder.
- **Phase C — Sets area:** `card_set.eligible_count`, `set_list` RPC, `SetsBrowser` + `SetDetail`, lazy create-on-submit.
- **Phase D — Start-page top modes:** show the N most-played modes.

Each phase becomes its own implementation plan. Phases are sequential (A→B→C→D); all land on the `feature/sets-release-year` branch and merge once at the end.

## Current relevant state

- One row per `oracle_id` in `card`; printings (set/rarity/images) in `card_art`; `card_set` (code, name, released_at, set_type, card_count) populated; `card.released_at` backfilled.
- `custom_mode(id, name, filter jsonb, filter_hash unique, card_count, created_at)`, RLS public-read, writes via `create-mode` edge function (service role). View `custom_mode_list` = mode + `entry_count`.
- `leaderboard(... pool text check in ('popular','all','custom'), mode_id uuid → custom_mode, constraint (pool='custom')=(mode_id not null))`. View `leaderboard_top`. Writes via `submit-score`.
- Card dealing RPCs: `get_game_cards(pool, count)` (popular/all), `get_mode_game_cards(mode_id, count)` (custom). Both share the same filter/UB/year logic.
- Client: `src/customModes/` (filter.ts, client.ts, types.ts), `src/leaderboard/` (client.ts, types.ts), `src/state/highscores.ts` (`PoolKind='popular'|'all'|'custom'`, localStorage personal bests), `src/share/score.ts` (encodes pool as a 0/1 flag in the share URL).
- 0 production custom modes; classic-pool leaderboard has test entries (to be wiped).

---

## Phase A — Mode foundation

### A.1 Rename (mechanical)

- DB: `custom_mode`→`mode`, `custom_mode_list`→`mode_list`. Update FK on `leaderboard.mode_id`, RLS policy names, the `create-mode` function's target table, `count_filtered_cards`/`get_mode_game_cards` references.
- Code: directory `src/customModes/`→`src/modes/`; update all imports. Function names already read "mode" (`createMode`, `listModes`, `getMode`, `fetchModeCandidates`) — keep them.
- Keep the edge function directory name `create-mode` (deploy name) to avoid redeploy churn; it just writes to `mode` now.

### A.2 `mode` gains `kind` + `slug`

```sql
alter table public.mode add column kind text not null default 'custom'
  check (kind in ('builtin','custom','set'));
alter table public.mode add column slug text unique;  -- set only for builtin
```
- `kind` is authoritative for listing: Custom Modes browser shows `kind='custom'`; Sets area shows `kind='set'`; builtin = `popular`/`all`.
- `create-mode` sets `kind` from the filter shape: a filter that is exactly `{sets:[oneCode]}` → `'set'`, otherwise `'custom'`. (Builtin rows are seeded, never created via the function.)

### A.3 `popular` filter dimension

- `filter.ts`: add `popular?: boolean` to `CustomFilter`. `canonicalizeFilter`: keep only when `true` (inserted first, before `cmc`). `modeName`: `popular` → label "Popular". `validateFilter`: no new rule.
- RPC clause (in the dealing/counting functions): `and (p_filter->>'popular' is null or c.is_popular)`.

### A.4 Seed builtin modes

```sql
insert into public.mode (name, filter, filter_hash, card_count, kind, slug) values
  ('Popular cards', '{"popular":true}', <sha256 of canonical {"popular":true}>, <count>, 'builtin', 'popular'),
  ('All cards',     '{}',               <sha256 of canonical {}>,               <count>, 'builtin', 'all');
```
Hashes are computed with the same algorithm as the client (`filterHash(canonicalizeFilter(...))`) so dedup stays consistent. `card_count` filled from `count_filtered_cards(filter)`.

### A.5 Unified card dealing

- New RPC `get_filtered_game_cards(p_filter jsonb, p_count int)` — same body as `get_mode_game_cards` but parameterized by the filter directly (no mode lookup). This deals popular/all/custom/set uniformly and lets a set be played before its mode exists (Phase C).
- `get_mode_game_cards(mode_id, count)` is retained as a thin wrapper (loads the filter by id, calls the shared logic) for any mode-id-based callers, OR dropped in favor of always dealing by filter. **Decision: drop `get_game_cards` and `get_mode_game_cards`; the client always deals via `get_filtered_game_cards(filter)`** (the client always has the mode's filter — builtin filters are known, custom/set filters are on the mode row / are `{sets:[code]}`).

### A.6 Leaderboard restructure (wipe)

```sql
delete from public.leaderboard;                 -- wipe all existing scores
alter table public.leaderboard drop constraint leaderboard_pool_check;
alter table public.leaderboard drop constraint leaderboard_mode_id_check;
alter table public.leaderboard drop column pool;
alter table public.leaderboard alter column mode_id set not null;
-- mode_id already FKs mode; keep index leaderboard_mode_score_idx.
drop view public.leaderboard_top;
create view public.leaderboard_top as
  select id, name, score, correct, mode_id, country, created_at from public.leaderboard;
grant select on public.leaderboard_top to anon;
```
- `submit-score`: require `mode_id` (no `pool`); insert keyed by `mode_id`.
- Every game (popular/all/custom/set) now submits with a `mode_id`. Popular/All resolve their `mode_id` via `slug`.

### A.7 Client changes

- `leaderboard/client.ts`: all reads/writes are mode-id based. Replace pool-based `fetchTopScores(pool)`/`fetchProjectedRank(pool)`/`submitScore({pool})` with the existing mode-based `fetchModeTopScores(modeId)`/`fetchModeProjectedRank(modeId)`/`submitScore({modeId})` as the only paths. `GlobalEntry`/`SubmitPayload` drop `pool`, keep `modeId` (required).
- Resolve builtin mode ids once: `getBuiltinModes()` → query `mode` where `slug in ('popular','all')`, returns `{popular: id, all: id}`. Cached in `gameStore` at startup (or fetched when the start screen mounts).
- `gameStore`: `selectPool` for the classic buttons now resolves to the builtin mode (filter + mode_id + name). `fetchCandidates` always calls `get_filtered_game_cards(filter)`. The store keeps `currentModeId`/`currentModeName`/`filter` for every game.
- **`pool` stays only as a client-side label** for (a) local personal bests (`highscores.ts`) and (b) the share URL/OG flag (`share/score.ts`), which are public-format and client-only. It is decoupled from the DB. `PoolKind` keeps `'popular'|'all'|'custom'` (sets reuse `'custom'` for share/local purposes). No DB column references `pool` after this phase.

### A.8 `mode_list` view

```sql
drop view public.custom_mode_list;  -- (renamed)
create view public.mode_list as
  select m.id, m.name, m.filter, m.card_count, m.kind, m.slug, m.created_at,
         count(l.id) as entry_count
  from public.mode m left join public.leaderboard l on l.mode_id = m.id
  group by m.id;
grant select on public.mode_list to anon;
```
- `listModes()` for the Custom Modes browser filters `kind='custom'`.

---

## Phase B — Custom Mode slim-down

Revert the set-picker UI added earlier in `CustomModeBuilder.tsx`: remove the set autocomplete block, the `existing`/`sets`/`setQuery` state, the `findExistingMode`/`listSets` imports, the `onExisting` prop, and the `existingGen` ref. Keep Year row, UB-exclude default, and everything else. `CustomModeBrowser` drops the `onExisting` wiring. The `sets` field remains in `CustomFilter`/RPCs (it backs sets in Phase C), just unused by the builder. Lower `MIN_CARDS` 100→50 in the builder (see Phase C gate change).

---

## Phase C — Sets area

### C.1 `card_set.eligible_count`

```sql
alter table public.card_set add column eligible_count int not null default 0;
```
Backfill (and add to the seed script + a backfill RPC, like `released_at`):
```sql
update public.card_set s set eligible_count = sub.n
from (select set_code, count(distinct oracle_id) n from public.card_art group by set_code) sub
where sub.set_code = s.code;
```

### C.2 Lower the play gate 100→50

`create-mode` edge function and the builder's `MIN_CARDS`: change the minimum from 100 to 50 (a 50-card pool is fine for a 90s run). Applies to both custom modes and sets.

### C.3 `set_list` RPC

Returns every qualifying set (`eligible_count >= 50`) with played-stats joined from its set-kind mode + leaderboard:
```
code, name, released_at, eligible_count, mode_id,
champion_name, champion_score, entry_count, last_activity
```
Stats are null when the set has no mode yet (unplayed). One query (~few hundred rows) powers the whole Sets UI; the client does the main-list/search/sort/filter.
- A set's mode is the `mode` row with `kind='set'` and `filter = {"sets":[code]}`.

### C.4 Play a set (deal by filter) + lazy create-on-submit

- Playing a set deals via `get_filtered_game_cards({sets:[code]})` — no mode required.
- On game-over post: `const mode = await findExistingMode({sets:[code]}) ?? (await createMode({sets:[code]})).mode;` then `submitScore({ modeId: mode.id, ... })`. First submitter creates the set's mode (`kind='set'`); everyone after reuses it. (`findExistingMode` already exists; `create-mode` sets `kind='set'` from filter shape per A.2.)

### C.5 UI

- Start screen: a 4th button **"Sets"** (in `PoolSelect`), new `screen='sets'` in `App`.
- `SetsBrowser`:
  - **Main list** = played sets only (`entry_count > 0`), leaderboard-styled rows: champion name → set name · year → entry count. Tap → `SetDetail`.
  - **Search box** on top → dropdown over *all* qualifying sets with a release-date filter and an **"unplayed only"** toggle. Played rows show standings summary and open `SetDetail` on tap; unplayed rows show an inline **Play** button.
  - Sort control for the list: default **recent-activity-first** (active in last 30 days by recency), then a toggle between **Most played** (entry_count) and **Newest** (release date).
- `SetDetail`: full ranking (top 8, "Show more" expands) via `fetchModeTopScores(mode_id, …)`; **Play** starts the set's game. After the run, the existing game-over screen posts to the set's board (C.4).

---

## Phase D — Start-page top modes

Show the top N (e.g., 5) most-played modes on the start screen, from `mode_list` ordered by `entry_count desc` (optionally excluding builtin, or including — TBD at plan time; default: show most-played `custom`+`set` modes). Tapping one opens its detail/board (reuse existing detail components) and lets the user play it. Small, additive; depends only on A.

---

## Testing strategy

- **Unit (filter.ts):** `popular` canonicalization + label; existing year/UB tests stay green.
- **Live RPC (Management API):** `get_filtered_game_cards` returns rows for `{popular:true}`, `{}`, `{sets:[code]}`; `set_list` returns qualifying sets with correct played-stats; gate accepts a 50-card pool.
- **Live data:** builtin modes seeded with correct counts; leaderboard wiped; `eligible_count` backfilled.
- **Browser walkthrough:** classic Popular/All still play and post (now via builtin modes); Custom Mode has no set picker; Sets list shows played sets, search dropdown lists all sets with play buttons for unplayed, playing+posting creates a set mode and it then appears in the main list.

## Risks / notes

- **Leaderboard wipe is destructive and intentional** — confirmed by user. Do it in the Phase A migration.
- The share URL format keeps its `pool` 0/1 flag (popular/all) for backward compatibility of already-shared links; sets/custom shares use the generic game URL.
- `get_filtered_game_cards` must keep the lateral art-join restriction so set/rarity-scoped art matches (carried over from `get_mode_game_cards`).
- Builtin filters: "All" = `{}` (entire eligible pool); "Popular" = `{popular:true}`. Confirm the "All = everything" reading matches the old `get_game_cards('all')` behavior during Phase A verification.
