# Sets Table, Release-Year Filter & UB Default — Design

**Date:** 2026-05-30
**Builds on:** the Custom Mode feature (`docs/superpowers/specs/2026-05-30-custom-mode-design.md`).

## Goal

Three additions to the Custom Mode builder:

1. A **`card_set`** table (set code, full name, release date) populated from Scryfall, so the builder can offer a **set autocomplete** (pick by name, not code) and so every card gets a **debut date**.
2. A new **release-year range filter** (years only), enabled by the per-card debut date.
3. **Universe Beyond default flips to Exclude** (chip order: Exclude · Include · Only UB).

## Context (current state)

- `card` is keyed one-row-per `oracle_id`; has no set or date column.
- Printings (sets + rarity) live on `card_art` (`set_code`, `set_name`, `rarity`, images). 473 distinct sets, ~60k printings.
- The custom-mode filter is a canonical jsonb hashed for dedup; RPCs `count_filtered_cards(jsonb)` and `get_mode_game_cards(uuid,int)` read it. Filter model + name + hash live in `src/customModes/filter.ts`.
- The builder's set field is a free-text comma list; single-set selection is exclusive (locks out other filters) via `validateFilter` + a disabled `<fieldset>`.
- `scripts/seed-cards.ts` streams Scryfall's bulk export into `card` + `card_art`; calls `reset_cards` RPC first.
- **0 production custom modes exist** → changing the UB canonical default is safe (no stored modes change meaning).

## Decisions

- **Card year = debut (earliest printing).** `card.released_at = min(card_set.released_at)` over the card's printings. One date per card; "1993–1999" means cards that debuted in that window.
- **Set picker = single set, autocomplete.** Pick exactly one set; stays exclusive (locks out the rest of the form). Reframes the builder as "build a **set** filter **or** a custom filter."
- **Existing-mode link.** When the user selects a set that already has a saved mode, surface a link to that mode's detail screen instead of letting them create a duplicate.
- **Stored, not computed.** `card.released_at` is a real column (backfilled), so year filtering needs no per-row subquery.
- **Table name `card_set`** (`set` is a SQL reserved word).
- **No recurring sync.** One-time backfill now + coverage in the seed script is enough.

## Components

### 1. `card_set` table + `card.released_at` (migration `0004_sets_release.sql`)

```sql
create table public.card_set (
  code        text primary key,
  name        text not null,
  released_at date,
  set_type    text,
  card_count  int
);
alter table public.card_set enable row level security;
create policy card_set_read on public.card_set for select using (true);

alter table public.card add column released_at date;
create index card_released_at_idx on public.card (released_at);
```

Backfill (run after `card_set` is populated):

```sql
update public.card c
set released_at = sub.debut
from (
  select a.oracle_id, min(s.released_at) as debut
  from public.card_art a
  join public.card_set s on s.code = a.set_code
  group by a.oracle_id
) sub
where sub.oracle_id = c.oracle_id;
```

### 2. Set population (`scripts/seed-cards.ts` + one-time backfill)

- Fetch `https://api.scryfall.com/sets` (paginated; reuse `scryfallGet`). Each set → `{ code, name, released_at, set_type, card_count }`.
- Upsert into `card_set` (service role). Add to the seed `main()` after card/art insert, then run the `card.released_at` backfill via a `reset`-style step or inline `UPDATE`.
- **Immediate backfill (this feature):** a standalone run (or Management-API SQL) populates `card_set` from `/sets` and runs the `UPDATE` above, without a full card reseed.

### 3. Filter model (`src/customModes/filter.ts`)

- Add `year?: Range` (integer years).
- `canonicalizeFilter`: clean `year` like other ranges; insert in fixed order (after `edhrec`, before `sets`).
- `validateFilter`: ordered-range check includes `year`. Single-set exclusivity already covers `year` (any non-`sets` key trips it).
- `modeName`: add `rangeLabel('', f.year)` style → `1993–1999` / `≥2015` / `≤2003`.
- **UB default flip:** treat `'no'` as default. `canonicalizeFilter` stores `ub` only when `'yes'` or `'only'` (drop `'no'`). `modeName`: drop the "No UB" label (now default); `'yes'` → "Incl. UB"; `'only'` → "Universe Beyond".

### 4. RPC changes (in the same migration)

Both `count_filtered_cards` and `get_mode_game_cards`:

- **Year:** `and (p_filter->'year'->>'min' is null or (c.released_at is not null and extract(year from c.released_at) >= (p_filter->'year'->>'min')::int))` and the symmetric `max`.
- **UB flip:** replace the current `v_ub is null or v_ub='yes' …` block with:
  `and (v_ub = 'yes' or (coalesce(v_ub,'no') = 'no' and not c.is_ub) or (v_ub = 'only' and c.is_ub))`
  so omitted/`'no'` excludes UB, `'yes'` includes all, `'only'` keeps UB.

### 5. Client (`src/customModes/client.ts`)

```ts
export interface SetItem { code: string; name: string; released_at: string | null; }

export async function listSets(): Promise<SetItem[]> {
  const c = getSupabase();
  if (!c) return [];
  const { data, error } = await c.from('card_set')
    .select('code,name,released_at')
    .order('released_at', { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SetItem[];
}

export async function findExistingMode(filter: CustomFilter): Promise<CustomMode | null> {
  const c = getSupabase();
  if (!c) return null;
  const hash = await filterHash(filter);
  const { data, error } = await c.from('custom_mode')
    .select('id,name,filter,card_count').eq('filter_hash', hash).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CustomMode) ?? null;
}
```

### 6. Builder UI (`src/ui/CustomModeBuilder.tsx`)

- Replace the set text input with a **single-set autocomplete**: text input filters `listSets()` (loaded once) by name/code; dropdown shows `Name · YYYY` sorted newest-first; click sets `sets:[code]`; a clear (×) resets. Show the picked set's full name + year as a chip.
- On set pick, call `findExistingMode({ sets:[code] })`; if found, render an inline link "This set already has a mode → View it" that calls a new `onExisting(mode)` prop (browser opens its detail).
- Add a **Year** `RangeRow` in the Ranges block (custom path; disabled with the rest when a set is chosen).
- **UB chips reordered** to `['no','yes','only']` → labels Exclude · Include · Only UB; default active = Exclude (`filter.ub ?? 'no'`).

### 7. `CustomModeBrowser` + `FilterChips`

- `CustomModeBrowser`: pass an `onExisting` handler into the builder that calls `openDetail(mode)`.
- `FilterChips`: render a `year` chip (`1993–1999`) and, when a single set is present, prefer the set's full name if available (best-effort; code fallback is fine).

## Data flow

Builder set-pick → `findExistingMode` → existing? link to detail : normal create.
Builder year/other → `count_filtered_cards` (debut-year via `card.released_at`) → ≥100 gate → `create-mode` (hash dedup) → `get_mode_game_cards` (same year/UB logic) → identical 90s game.

## Testing

- `filter.test.ts`: `year` canonicalization + ordering; year in `modeName`; UB default-`no` canonicalization (omit `no`, keep `yes`/`only`); UB labels in `modeName`; single-set exclusivity still trips with `year` set.
- RPC: manual live check via Management API — a year-bounded count, a UB-exclude vs include count delta, and `get_mode_game_cards` returning rows within the year range.
- Builder: live browser walkthrough — autocomplete picks a set, existing-mode link appears for an already-created set, year range changes the count, UB default shows Exclude active.

## Out of scope

- Recurring set-sync scheduling.
- Changing `card_art` schema (set names come from the `card_set` join / existing `set_name`).
- Multi-set selection (single-set only, per decision).
