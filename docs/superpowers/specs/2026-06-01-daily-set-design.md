# Daily Set — design

**Date:** 2026-06-01
**Status:** Approved (brainstorming) — ready for implementation plan

## Problem / goal

Add a daily challenge to the start screen: a full-width **"Daily Set"** button at the very top (above the Today/Weekly/All-time pills). Each day a single random, never-before-played MTG set becomes the day's challenge, played with one fixed (randomly chosen) reveal mode. Everyone competes on the same set+reveal. A player may only play the Daily Set **3 times per day** so the leaderboard can't be ground out.

Decisions locked in brainstorming:
- **Creation:** lazy — the first request of the day creates the daily set; everyone else joins it. (No pg_cron.)
- **Reveal:** one reveal mode per day, chosen randomly from the enabled modes, shared by all.
- **3-plays/day limit:** enforced server-side (in `submit-score`), shown client-side.
- **Day boundary:** Europe/Berlin midnight (German time) for both the daily set and the play limit.

## Non-goals

- No pg_cron / scheduled jobs.
- No change to normal mode creation, scoring, or reveal mechanics.
- No new identity rules — a nameless player may play the daily but (as everywhere) cannot post; the cap therefore only constrains scoring (named) players, which is exactly what protects the board.

## Definitions

- **Berlin day:** `(now() at time zone 'Europe/Berlin')::date`.
- **Unplayed set:** a set with no `mode` whose filter is exactly `{sets:[code]}` (any kind). `set_list()` already exposes this as `mode_id = null`, and only returns sets with `eligible_count >= 50`.
- **Daily mode:** the set-kind `mode` referenced by today's `daily_set` row.

## Data model

New table `public.daily_set`:

```sql
create table public.daily_set (
  day        date primary key,          -- Berlin calendar day
  mode_id    uuid not null references public.mode(id),
  reveal     text not null,             -- the day's reveal mode key
  created_at timestamptz not null default now()
);
alter table public.daily_set enable row level security;
create policy daily_set_public_read on public.daily_set for select using (true);
-- No insert/update/delete policy → only the service role (edge function) writes.
grant select on public.daily_set to anon, authenticated;
```

## Daily-set creation — edge function `daily-set` (service role)

Idempotent "create-or-get for today". Called when the user first interacts with the Daily Set (opening the modal / pressing Play). Steps:

1. `day := today in Europe/Berlin`.
2. `select * from daily_set where day = :day` → if present, return it (join to `mode` + `card_set` for the set name/code).
3. Otherwise:
   a. Pick a random unplayed eligible set: from `set_list()` where `mode_id is null` (these already satisfy `eligible_count >= 50`); if none, fall back to any eligible set (repeat allowed — only happens once the whole catalogue is exhausted).
   b. Create the set-mode the same way `create-mode` does: `filter = {sets:[code]}`, `filter_hash`, `card_count` via `count_filtered_cards`, `kind = 'set'`, `name = <set name>`. Dedup on `filter_hash` (an existing mode is reused).
   c. Pick a random **enabled** reveal (`reveal_mode where enabled order by random() limit 1`).
   d. `insert into daily_set(day, mode_id, reveal) values (...) on conflict (day) do nothing;` then re-select the row. The winner of a race defines the day; a mode created by a loser simply stays unused (harmless).
4. Return `{ day, modeId, reveal, setCode, setName }`.

> `filter_hash` is computed the same way the client/`create-mode` does it (sha-256 of the canonical filter). The edge function must replicate `canonicalizeFilter` + hashing (mirror the existing logic used by `create-mode` callers).

## Read + status (no creation, client-side)

The start-screen button must show the leader **without** creating the set, so it reads
the public `daily_set` row directly and composes the rest from existing helpers — no
new RPC, no board logic duplicated in SQL:

1. Compute today's Berlin date client-side (`Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' })` → `YYYY-MM-DD`).
2. `daily_set?day=eq.<berlinDate>` (public read) → the row, or none if not created yet. Join/lookup the set name+code (the `mode.name` is the set name; the set code is in the filter `{sets:[code]}`).
3. **Leader:** reuse `fetchComboBoard(modeId, reveal)` and take rank 1.
4. **plays_used:** query `leaderboard_top` filtered by `mode_id`, `device_id = uid` (from `getUserId()`), `created_at >= <berlin-midnight ISO>`; the row count is plays used today. `0` when signed out. This is display-only; the authoritative cap lives in `submit-score`.

Around midnight a small client/server clock skew is harmless: the `daily-set` edge
function is authoritative for creation, and the cap is recomputed server-side on submit.

## 3-plays/day enforcement (server)

In `submit-score`: after resolving the verified user, if the submitted `modeId` equals today's daily mode (`select mode_id from daily_set where day = berlin_today()`), count the user's existing daily rows for the Berlin day:

```
select count(*) from leaderboard
where mode_id = :modeId and device_id = :uid
  and (created_at at time zone 'Europe/Berlin')::date = (now() at time zone 'Europe/Berlin')::date;
```

If `count >= 3`, reject with `{ ok:false, reason:'daily-limit' }`. Otherwise proceed as normal. (The first three submissions of the day go through.)

## Client

- `src/daily/client.ts`
  - `berlinToday(): string` — today's Berlin date `YYYY-MM-DD`.
  - `fetchDailyToday(): Promise<DailyToday | null>` — reads the public `daily_set` row for today, then composes leader (via `fetchComboBoard`) + `playsUsed` (leaderboard query); returns `{ modeId, reveal, setCode, setName, leader: {name,score,country}|null, playsUsed }` or `null` when not created yet.
  - `ensureDailyToday(): Promise<DailyToday>` — invokes the `daily-set` edge function (create-or-get), then composes the same shape.
- `src/ui/DailySetButton.tsx` — full-width button rendered at the very top of `StartModes`, **above** the time-window pills. Shows "Daily Set"; once today's set exists, "Daily Set · \<setName\>" plus the leader (flag · name · score). On click → opens the modal.
- `src/ui/DailySetModal.tsx` — modal popup: set name + reveal-of-the-day label, the `(mode, reveal)` leaderboard, a "X/3 plays left today" line, and a **Play** button at the top (disabled at 0 left). Play → `ensureDailyToday()` (creates if needed) → `useGameStore.setRevealChoice(reveal)` + `selectPool({ kind:'custom', modeId, filter:{sets:[code]}, name:setName })`.

### StartModes changes
- Render `DailySetButton` as the first child (above the window pills).
- Change the default time window from `'week'` to `'today'` (`useState<TimeWindow>('today')`).

## Edge cases

- **No set yet today:** button shows plain "Daily Set" with no leader; opening the modal (or Play) triggers creation.
- **Catalogue exhausted (no unplayed set):** fall back to any eligible set.
- **Signed out / nameless:** may open and play; `playsUsed = 0` and the score won't post (no name). The cap only limits posted (named) runs — the board stays protected.
- **At 3/3:** Play disabled in the modal; a 4th submit would also be refused server-side as defense in depth.

## Testing

- **DB/SQL (verified against the live project via the management API, like migration 0014):** the `daily_set` table + RLS public-read work; the Berlin-day expression used by `submit-score` and the edge function is correct.
- **Edge function logic:** unplayed-set selection skips sets that already have a `{sets:[code]}` mode; same-day idempotency (second call returns the same row); reveal is an enabled one.
- **submit-score:** the 4th daily submission of the Berlin day is rejected with `daily-limit`; non-daily modes are unaffected; the 3rd still succeeds.
- **UI unit tests:** `DailySetButton` renders the placeholder vs. leader; `DailySetModal` shows "X/3", disables Play at 0, and wires Play to the daily mode+reveal. StartModes default window is `'today'`.
- **Browser smoke:** button appears top, opens modal, Play starts the daily set in the day's reveal; "plays left" decrements after a posted run.

## Files (anticipated)

- New SQL migration: `daily_set` table + RLS public-read grant.
- New edge function: `supabase/functions/daily-set/index.ts`.
- Modified edge function: `supabase/functions/submit-score/index.ts` (daily cap).
- New client: `src/daily/client.ts`.
- New UI: `src/ui/DailySetButton.tsx`, `src/ui/DailySetModal.tsx`.
- Modified UI: `src/ui/StartModes.tsx` (mount button at top, default window `today`).
