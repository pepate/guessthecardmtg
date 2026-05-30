# Custom Mode — Design Spec

**Date:** 2026-05-30
**Branch:** `feature/custom-mode`
**Status:** Approved design, ready for implementation plan

## Goal

Add a third play option, **Custom Mode**, alongside the existing *Popular cards* and
*All cards*. A custom mode is a **card pool defined by a user-built filter**. Other
users can discover and play any mode; each mode has its **own separate leaderboard**.

The gameplay is **identical to the existing 90s Time Attack** (staged reveal, 4 name
options, same scoring). Only *which cards are drawn* changes. No engine changes.

## Requirements (from the request)

- Third button "Custom Mode" on the start screen → opens a new screen with its own
  leaderboards.
- A user can build a filter from: CMC (min–max), Colors (multiselect), Type
  (multiselect), Power/Toughness (min–max, **only when type is exactly Creature**),
  Universe Beyond (Yes / No / Only), EDH rank (min–max), Set (multiselect), Rarity.
- **At least 100 cards** must match a filter or it is not playable / not creatable.
- The mode **name is auto-generated** from the filter selection.
- Creating a mode that already exists (same filter) returns the existing mode instead
  of a duplicate.
- The custom-mode landing shows mode leaderboards, with the **most-played mode**
  surfaced first. There are **Create** and **Random** buttons. Picking a mode shows a
  **detail screen with its filters + leaderboard** before Play.

## Decisions

- **D1 — Storage/query:** jsonb filter + dynamic (parameterised) SQL RPCs. *(approved)*
- **D2 — Leaderboard:** extend the existing `leaderboard` table with a `mode_id`. *(approved)*
- **Write path:** new `create-mode` edge function (service role), mirroring `submit-score`.

## 1. Data model — migration `0003_custom_modes.sql`

```sql
create table public.custom_mode (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,              -- auto-generated label
  filter      jsonb not null,             -- canonical filter object
  filter_hash text not null unique,       -- sha256(canonical filter) → dedup
  card_count  int  not null,              -- snapshot at creation (≥100)
  created_at  timestamptz not null default now()
);
alter table public.custom_mode enable row level security;
create policy custom_mode_read on public.custom_mode for select using (true);
-- No write policy: inserts happen only via the create-mode edge function (service role).
```

Leaderboard changes in the same migration:

- `alter table public.leaderboard add column mode_id uuid references public.custom_mode(id);`
- Replace the `pool` check with `pool in ('popular','all','custom')`.
- Add `check ((pool = 'custom') = (mode_id is not null))` — `mode_id` set iff custom.
- New index `leaderboard_mode_score_idx on public.leaderboard (mode_id, score desc, created_at asc)`.
- Recreate `leaderboard_top` view to also expose `mode_id`.
- New view `custom_mode_list`: every `custom_mode` row plus its leaderboard entry count
  (`left join` + `group by`), used to sort the landing list by popularity.

## 2. Filter schema + RPCs

Canonical filter object (keys that are empty/at default are **dropped** before hashing):

```ts
interface CustomFilter {
  cmc?:       { min?: number; max?: number };
  colors?:    { values: ('W'|'U'|'B'|'R'|'G'|'C')[]; match: 'any'|'all' }; // C = colorless
  types?:     string[];   // Creature, Instant, Sorcery, Artifact, Enchantment,
                          // Planeswalker, Land, Battle
  power?:     { min?: number; max?: number };     // only valid when types === ['Creature']
  toughness?: { min?: number; max?: number };     // only valid when types === ['Creature']
  ub?:        'yes' | 'no' | 'only';
  edhrec?:    { min?: number; max?: number };
  sets?:      string[];   // set_code list
  rarities?:  ('common'|'uncommon'|'rare'|'mythic')[];
}
```

Two RPCs (plpgsql) build a WHERE clause with **bound values only** — filter values are
never string-concatenated into SQL; column identifiers are fixed in code:

- `count_filtered_cards(p_filter jsonb) returns int` — powers the live preview and the
  ≥100 creation gate.
- `get_mode_game_cards(p_mode_id uuid, p_count int)` — reads the stored filter from
  `custom_mode`, returns the **same row shape** as `get_game_cards`. The lateral
  art-join is restricted to a **matching printing** when `sets`/`rarities` are set, so a
  "Rare from Dominaria" mode shows the actual Dominaria rare art. `p_count` clamped like
  `get_game_cards`. Granted to `anon`, `authenticated`.

## 3. Filter semantics (per field)

- **CMC / EDH rank / power / toughness:** `between` on optional min/max bounds.
  `power`/`toughness` are stored as `text`; numeric ranges use a guarded cast
  (`power ~ '^[0-9]+$'`), so `*` / `1+*` are excluded from numeric comparisons. Rows with
  `edhrec_rank IS NULL` are excluded when any rank bound is set.
- **Colors:** operate on the `colors` array. `match: 'any'` → `colors && selected`;
  `match: 'all'` → `colors @> selected`. Selecting **C (colorless)** matches
  `colors = '{}'`, OR-combined with any chosen colors.
- **Types:** OR of `type_line ILIKE '%Type%'` across the selected list.
- **Power/Toughness inputs** are only shown in the builder when the type selection is
  exactly `['Creature']`; re-validated server-side.
- **UB:** `yes` = no filter; `no` = `not is_ub`; `only` = `is_ub`.
- **Sets / Rarity:** `EXISTS` against `card_art` (these columns live on printings, not
  `card`). **Single-set rule:** if exactly one set is selected, all other filters are
  disabled in the builder and rejected server-side (too few cards otherwise).

## 4. Auto-name generation

A pure `modeName(filter)` builder, e.g. `Mono-Red Creatures · CMC 1–3 · Rare`,
`WU Instants & Sorceries · EDH ≤500`. The **server** (create-mode) regenerates the name
from the filter so it is authoritative; the builder shows a client-side preview using
the same logic. (Whether the function is physically shared between the app bundle and the
Deno edge function, or duplicated, is a plan-level decision.)

## 5. Write path — `create-mode` edge function

Mirrors `submit-score` (service role, CORS, IP-hash rate limit):

1. Validate filter shape/bounds + single-set rule (reject malformed → `bad-filter`).
2. `count_filtered_cards(filter)`; reject `< 100` → reason `too-few` (include count).
3. Compute canonical hash + auto-name.
4. Insert; on `filter_hash` unique conflict, fetch and return the existing mode:
   `{ ok:true, existed:true, mode }`. New insert → `{ ok:true, existed:false, mode }`.
5. Rate-limited by IP hash like score submission.

## 6. Client architecture

- `PoolSelection` becomes a union:
  - `{ kind: 'popular'|'all'; excludeUniverseBeyond: boolean }`
  - `{ kind: 'custom'; modeId: string; filter: CustomFilter; name: string }`
- `fetchCandidates` branches: custom → `get_mode_game_cards`. **Engine, planning,
  reveal, and scoring are untouched.**
- `gameStore`: `poolKind` carries an optional `modeId` for custom games;
  `finishGame`/highscores key custom runs by `modeId`; `restart` replays the same mode.
- **Navigation:** a small UI screen-state (`'home' | 'custom'`) in `App` — not a router.
  `phase==='idle' && screen==='custom'` renders the browser overlay; picking a mode →
  `selectPool(customSelection)` drops into the existing `loading → playing → gameover`.
- New client modules:
  - `src/customModes/client.ts` — list, get-by-id, create, random, count preview,
    `get_mode_game_cards`.
  - `src/customModes/filter.ts` — `CustomFilter` type, canonicalize, hash, `modeName`,
    single-set rule helper.

## 7. UI

- **Start screen:** third button **"Custom Mode"** under the existing two (in/near
  `PoolSelect`).
- **Browser landing** (`screen==='custom'`): mode list sorted by entry count (each row:
  name + filter chips + entry count); the most-played mode's leaderboard shown up top;
  **Create** and **Random** buttons; back arrow to home.
- **Mode detail:** filter chips + that mode's leaderboard + **Play**.
- **Builder:** the filter form with a **live card count** ("1,240 cards — playable" vs.
  "62 cards — need ≥100" with the create button disabled). On submit: create-or-find; if
  it already existed, jump to its detail screen.
- **Game over:** `GameOverLeaderboard` gains mode context — shows/sorts the mode's board
  and submits the score with `mode_id`.

## 8. Testing

- **Vitest unit tests:** `filter.ts` canonicalization + hash stability (same filter ⇒
  same hash regardless of input order) + `modeName` output; single-set rule;
  `PoolSelection` custom branching in the store/client.
- The filtering SQL (RPCs) and the `create-mode` function are validated against the live
  Supabase project during implementation (count correctness, single-set rejection,
  duplicate-returns-existing, <100 rejection, matching-printing art).

## 9. Out of scope (YAGNI)

- No mode editing or deletion; modes are immutable once created.
- No ownership / auth — creation is anonymous (rate-limited).
- No free-text mode names (auto-generated only ⇒ no name moderation needed).
- No per-mode time-window tabs (Today/Week/All) like the global board.
- No mode search or favouriting.
- No gameplay/mechanics changes.
