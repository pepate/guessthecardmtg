# Sets Table, Release-Year Filter & UB Default Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `card_set` table + per-card debut date so the Custom Mode builder can offer a set-name autocomplete and a release-year range filter, and flip the Universe-Beyond default to Exclude.

**Architecture:** A new `card_set` table (populated from Scryfall `/sets`) gives every card a stored `released_at` debut date via an `UPDATE … FROM` backfill. The jsonb filter model gains a `year` range; both filter RPCs gain a year clause and a flipped UB default. The builder replaces its free-text set field with a single-set autocomplete that links to an already-existing mode.

**Tech Stack:** Supabase Postgres (RPC + migrations via Management API), React + TypeScript + Vite, Vitest, Scryfall REST API.

**Environment notes:**
- Supabase project ref: `jgapiqpaeaslfpbgiptf`. DDL/SQL is applied via the Management API:
  `curl -s -X POST "https://api.supabase.com/v1/projects/jgapiqpaeaslfpbgiptf/database/query" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" -d '{"query":"<SQL>"}'`
  (token is short-lived; ask the user for a fresh one if it 401s).
- `card_art.set_code` values are lowercase Scryfall codes and match `card_set.code`.
- `FilterChips` renders `modeName(filter).split(' · ')`, so anything added to `modeName` shows as a chip automatically — no FilterChips edit needed.
- Run a worktree per superpowers:using-git-worktrees before executing (main may see concurrent edits).

---

### Task 1: Migration — `card_set` table, `card.released_at`, RPC year + UB flip

**Files:**
- Create: `supabase/migrations/0004_sets_release.sql`
- Apply: via Management API (see Environment notes)

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/0004_sets_release.sql`:

```sql
-- Sets list (from Scryfall /sets) + per-card debut date. Enables the builder's
-- set-name autocomplete and a release-year filter. Public read; writes are
-- service-role only (seed script).
create table public.card_set (
  code        text primary key,
  name        text not null,
  released_at date,
  set_type    text,
  card_count  int
);
alter table public.card_set enable row level security;
create policy card_set_read on public.card_set for select using (true);
grant select on public.card_set to anon, authenticated;

-- A card's debut date = earliest release among its printings' sets. Stored
-- (not computed per-query) so the year filter stays index-friendly.
alter table public.card add column released_at date;
create index card_released_at_idx on public.card (released_at);

-- Recreate count_filtered_cards: + year range, + flipped UB default.
-- UB: omitted/'no' => exclude UB; 'yes' => include all; 'only' => UB only.
create or replace function public.count_filtered_cards(p_filter jsonb)
returns int
language plpgsql
stable
as $$
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
  where (p_filter->'cmc'->>'min' is null or c.cmc >= (p_filter->'cmc'->>'min')::real)
    and (p_filter->'cmc'->>'max' is null or c.cmc <= (p_filter->'cmc'->>'max')::real)
    and (p_filter->'edhrec'->>'min' is null or (c.edhrec_rank is not null and c.edhrec_rank >= (p_filter->'edhrec'->>'min')::int))
    and (p_filter->'edhrec'->>'max' is null or (c.edhrec_rank is not null and c.edhrec_rank <= (p_filter->'edhrec'->>'max')::int))
    and (p_filter->'year'->>'min' is null or (c.released_at is not null and extract(year from c.released_at) >= (p_filter->'year'->>'min')::int))
    and (p_filter->'year'->>'max' is null or (c.released_at is not null and extract(year from c.released_at) <= (p_filter->'year'->>'max')::int))
    and (p_filter->'power'->>'min' is null or (c.power ~ '^[0-9]+$' and c.power::int >= (p_filter->'power'->>'min')::int))
    and (p_filter->'power'->>'max' is null or (c.power ~ '^[0-9]+$' and c.power::int <= (p_filter->'power'->>'max')::int))
    and (p_filter->'toughness'->>'min' is null or (c.toughness ~ '^[0-9]+$' and c.toughness::int >= (p_filter->'toughness'->>'min')::int))
    and (p_filter->'toughness'->>'max' is null or (c.toughness ~ '^[0-9]+$' and c.toughness::int <= (p_filter->'toughness'->>'max')::int))
    and (v_ub = 'yes' or (coalesce(v_ub, 'no') = 'no' and not c.is_ub) or (v_ub = 'only' and c.is_ub))
    and (
      cardinality(v_colors) = 0
      or (
        (case when v_match = 'all'
              then c.colors @> (select array_agg(x) from unnest(v_colors) x where x <> 'C')
              else c.colors && (select array_agg(x) from unnest(v_colors) x where x <> 'C')
         end)
        or ('C' = any(v_colors) and (c.colors is null or cardinality(c.colors) = 0))
      )
    )
    and (cardinality(v_types) = 0 or exists (
      select 1 from unnest(v_types) t where c.type_line ilike '%' || t || '%'
    ))
    and (cardinality(v_sets) = 0 or exists (
      select 1 from public.card_art a where a.oracle_id = c.oracle_id and a.set_code = any(v_sets)
    ))
    and (cardinality(v_rar) = 0 or exists (
      select 1 from public.card_art a where a.oracle_id = c.oracle_id and a.rarity = any(v_rar)
    ));
  return v_count;
end;
$$;
grant execute on function public.count_filtered_cards(jsonb) to anon, authenticated;

-- Recreate get_mode_game_cards with the same year + UB changes in the inner filter.
create or replace function public.get_mode_game_cards(p_mode_id uuid, p_count int)
returns table (
  oracle_id uuid, name text, cmc real, colors text[], color_identity text[],
  type_line text, power text, toughness text, rarity text, set_code text,
  set_name text, image_normal text, image_art_crop text
)
language plpgsql
stable
as $$
declare
  p_filter jsonb;
  v_colors text[];
  v_match text; v_types text[]; v_sets text[]; v_rar text[]; v_ub text;
begin
  select filter into p_filter from public.custom_mode where id = p_mode_id;
  if p_filter is null then return; end if;
  v_colors := coalesce(array(select jsonb_array_elements_text(p_filter#>'{colors,values}')), '{}');
  v_match  := coalesce(p_filter#>>'{colors,match}', 'any');
  v_types  := coalesce(array(select jsonb_array_elements_text(p_filter->'types')), '{}');
  v_sets   := coalesce(array(select jsonb_array_elements_text(p_filter->'sets')), '{}');
  v_rar    := coalesce(array(select jsonb_array_elements_text(p_filter->'rarities')), '{}');
  v_ub     := p_filter->>'ub';

  return query
  select c.oracle_id, c.name, c.cmc, c.colors, c.color_identity,
         c.type_line, c.power, c.toughness,
         a.rarity, a.set_code, a.set_name, a.image_normal, a.image_art_crop
  from (
    select * from public.card c
    where (p_filter->'cmc'->>'min' is null or c.cmc >= (p_filter->'cmc'->>'min')::real)
      and (p_filter->'cmc'->>'max' is null or c.cmc <= (p_filter->'cmc'->>'max')::real)
      and (p_filter->'edhrec'->>'min' is null or (c.edhrec_rank is not null and c.edhrec_rank >= (p_filter->'edhrec'->>'min')::int))
      and (p_filter->'edhrec'->>'max' is null or (c.edhrec_rank is not null and c.edhrec_rank <= (p_filter->'edhrec'->>'max')::int))
      and (p_filter->'year'->>'min' is null or (c.released_at is not null and extract(year from c.released_at) >= (p_filter->'year'->>'min')::int))
      and (p_filter->'year'->>'max' is null or (c.released_at is not null and extract(year from c.released_at) <= (p_filter->'year'->>'max')::int))
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
    order by random()
    limit 1
  ) a;
end;
$$;
grant execute on function public.get_mode_game_cards(uuid, int) to anon, authenticated;
```

- [ ] **Step 2: Apply the migration**

Post the file contents as the `query` to the Management API endpoint (Environment notes). Send it in one request (the JSON body must escape newlines — use a tool that reads the file and posts it, e.g. `jq -Rs '{query: .}' supabase/migrations/0004_sets_release.sql | curl … -d @-`).

- [ ] **Step 3: Verify schema applied**

Run:
```sql
select count(*) from information_schema.columns where table_schema='public' and table_name='card' and column_name='released_at';
select count(*) from information_schema.tables where table_schema='public' and table_name='card_set';
```
Expected: both return `1`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0004_sets_release.sql
git commit -m "feat: card_set table, card.released_at, year filter + UB-default flip in RPCs"
```

---

### Task 2: Populate `card_set` from Scryfall + backfill `card.released_at`

**Files:**
- Modify: `scripts/seed-cards.ts` (keep sets fresh on future reseeds)
- Run: one-time population now (does not require the 8GB all-cards.json reseed)

- [ ] **Step 1: Add set fetch + upsert + backfill to the seed script**

In `scripts/seed-cards.ts`, add after the `fetchUbOracleIds` function:

```ts
interface SetRow { code: string; name: string; released_at: string | null; set_type: string | null; card_count: number | null; }

/** Fetch every set from Scryfall's /sets endpoint (single paginated list). */
async function fetchSets(): Promise<SetRow[]> {
  const rows: SetRow[] = [];
  let next: string | null = `${SCRYFALL}/sets`;
  while (next) {
    const res = await scryfallGet(next);
    const json: { data?: any[]; has_more?: boolean; next_page?: string } = await res.json();
    for (const s of json.data ?? []) {
      if (!s.code || !s.name) continue;
      rows.push({
        code: String(s.code).toLowerCase(),
        name: s.name,
        released_at: s.released_at ?? null,
        set_type: s.set_type ?? null,
        card_count: typeof s.card_count === 'number' ? s.card_count : null,
      });
    }
    next = json.has_more ? (json.next_page ?? null) : null;
    await sleep(150);
  }
  return rows;
}
```

In `main()`, after the `Inserting arts…` block and before `console.log('Done.')`:

```ts
  console.log('Fetching sets from Scryfall…');
  const sets = await fetchSets();
  console.log(`  ${sets.length} sets`);
  const upsert = await db.from('card_set').upsert(sets, { onConflict: 'code' });
  if (upsert.error) throw new Error(`upsert card_set failed: ${upsert.error.message}`);

  console.log('Backfilling card.released_at…');
  const backfill = await db.rpc('backfill_card_released_at');
  if (backfill.error) throw new Error(`backfill failed: ${backfill.error.message}`);
```

- [ ] **Step 2: Add the backfill RPC to the migration and re-apply**

Append to `supabase/migrations/0004_sets_release.sql`:

```sql
-- Recompute each card's debut date from its printings. Idempotent; run after
-- card_set is (re)populated.
create or replace function public.backfill_card_released_at()
returns void
language sql
as $$
  update public.card c
  set released_at = sub.debut
  from (
    select a.oracle_id, min(s.released_at) as debut
    from public.card_art a
    join public.card_set s on s.code = a.set_code
    group by a.oracle_id
  ) sub
  where sub.oracle_id = c.oracle_id;
$$;
grant execute on function public.backfill_card_released_at() to service_role;
```

Re-apply just this function via the Management API (same endpoint).

- [ ] **Step 3: Populate `card_set` now (one-time, no full reseed)**

Run this shell sequence (requires `jq`; `$SUPABASE_ACCESS_TOKEN` set to a fresh token):

```bash
# Fetch all sets from Scryfall and build a VALUES list, insert via Management API.
curl -s "https://api.scryfall.com/sets" -H "Accept: application/json" -H "User-Agent: GuessTheCard-seed/1.0" \
| jq -r '[.data[] | "(" + (.code|ascii_downcase|@json) + "," + (.name|@json) + "," + ((.released_at // null)|if .==null then "null" else @json end) + "," + ((.set_type // null)|if .==null then "null" else @json end) + "," + ((.card_count // null)|tostring) + ")"] | join(",")' \
> /tmp/set_values.txt

printf 'insert into public.card_set (code,name,released_at,set_type,card_count) values %s on conflict (code) do update set name=excluded.name, released_at=excluded.released_at, set_type=excluded.set_type, card_count=excluded.card_count;' "$(cat /tmp/set_values.txt)" \
| jq -Rs '{query: .}' \
| curl -s -X POST "https://api.supabase.com/v1/projects/jgapiqpaeaslfpbgiptf/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" -d @-
```

Then run the backfill:
```bash
curl -s -X POST "https://api.supabase.com/v1/projects/jgapiqpaeaslfpbgiptf/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"select public.backfill_card_released_at();"}'
```

- [ ] **Step 4: Verify population + backfill**

Run:
```sql
select count(*) as sets from public.card_set;
select count(*) as dated_cards, min(released_at) as earliest, max(released_at) as latest from public.card where released_at is not null;
```
Expected: `sets` ≈ 1000; `dated_cards` is a large share of the card table; `earliest` ≈ `1993-08-05` (Limited Edition Alpha).

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-cards.ts supabase/migrations/0004_sets_release.sql
git commit -m "feat: populate card_set from Scryfall and backfill card debut dates"
```

---

### Task 3: Filter model — `year` range + UB default flip

**Files:**
- Modify: `src/customModes/filter.ts`
- Test: `src/customModes/filter.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/customModes/filter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { canonicalizeFilter, validateFilter, modeName } from './filter';

describe('year filter', () => {
  it('canonicalizes year between edhrec and sets', () => {
    const c = canonicalizeFilter({ year: { min: 1993, max: 1999 }, edhrec: { min: 1 } });
    expect(c.year).toEqual({ min: 1993, max: 1999 });
    expect(JSON.stringify(c)).toContain('"edhrec"');
  });
  it('rejects an inverted year range', () => {
    expect(validateFilter({ year: { min: 2010, max: 2000 } })).toEqual({ ok: false, reason: 'bad-range' });
  });
  it('labels a year range in the mode name', () => {
    expect(modeName({ year: { min: 1993, max: 1999 } })).toContain('1993–1999');
  });
  it('single set is still exclusive when year is set', () => {
    expect(validateFilter({ sets: ['dom'], year: { min: 2018 } })).toEqual({ ok: false, reason: 'single-set-exclusive' });
  });
});

describe('UB default = exclude', () => {
  it('drops ub when no/undefined (exclude is the default)', () => {
    expect(canonicalizeFilter({ ub: 'no' }).ub).toBeUndefined();
    expect(canonicalizeFilter({}).ub).toBeUndefined();
  });
  it('keeps yes and only', () => {
    expect(canonicalizeFilter({ ub: 'yes' }).ub).toBe('yes');
    expect(canonicalizeFilter({ ub: 'only' }).ub).toBe('only');
  });
  it('labels include/only but not the default exclude', () => {
    expect(modeName({ ub: 'yes' })).toContain('Incl. UB');
    expect(modeName({ ub: 'only' })).toContain('Universe Beyond');
    expect(modeName({})).not.toContain('UB');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/customModes/filter.test.ts`
Expected: FAIL (year not handled; `ub: 'no'` currently kept; "No UB" label still present).

- [ ] **Step 3: Implement the changes**

In `src/customModes/filter.ts`:

Add `year` to the `CustomFilter` interface (after `toughness`, before `ub`):
```ts
  year?: Range;
```

In `canonicalizeFilter`, after the `edhrec` block and before the `sets` block:
```ts
  const year = cleanRange(f.year);
  if (year) out.year = year;
```

Change the UB line from:
```ts
  if (f.ub && f.ub !== 'yes') out.ub = f.ub; // 'yes' == no filter == default
```
to:
```ts
  if (f.ub && f.ub !== 'no') out.ub = f.ub; // 'no' (exclude) is the default
```

In `validateFilter`, change the range loop to include `year`:
```ts
  for (const r of [f.cmc, f.power, f.toughness, f.edhrec, f.year]) {
```

In `modeName`, replace the UB lines:
```ts
  if (f.ub === 'only') parts.push('Universe Beyond');
  if (f.ub === 'no') parts.push('No UB');
```
with:
```ts
  if (f.ub === 'only') parts.push('Universe Beyond');
  if (f.ub === 'yes') parts.push('Incl. UB');
```
and add, immediately before the UB lines (after the `edh` push):
```ts
  if (f.year) {
    if (f.year.min != null && f.year.max != null) parts.push(`${f.year.min}–${f.year.max}`);
    else if (f.year.min != null) parts.push(`≥${f.year.min}`);
    else if (f.year.max != null) parts.push(`≤${f.year.max}`);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/customModes/filter.test.ts`
Expected: PASS (all, including the pre-existing tests).

- [ ] **Step 5: Commit**

```bash
git add src/customModes/filter.ts src/customModes/filter.test.ts
git commit -m "feat: year range filter + flip UB default to exclude in filter model"
```

---

### Task 4: Client — `listSets` and `findExistingMode`

**Files:**
- Modify: `src/customModes/client.ts`

- [ ] **Step 1: Add the `SetItem` type and two functions**

In `src/customModes/client.ts`, add after the imports:

```ts
export interface SetItem {
  code: string;
  name: string;
  released_at: string | null;
}
```

Add these exported functions at the end of the file:

```ts
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
  const hash = await filterHash(canonicalizeFilter(filter));
  const { data, error } = await c.from('custom_mode')
    .select('id,name,filter,card_count')
    .eq('filter_hash', hash)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CustomMode) ?? null;
}
```

(`canonicalizeFilter`, `filterHash`, and `CustomFilter` are already imported in this file; `CustomMode` is imported from `./types`.)

- [ ] **Step 2: Verify it type-checks**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/customModes/client.ts
git commit -m "feat: listSets and findExistingMode client helpers"
```

---

### Task 5: Builder UI — set autocomplete, year row, UB reorder, existing-mode link

**Files:**
- Modify: `src/ui/CustomModeBuilder.tsx`

- [ ] **Step 1: Add the `onExisting` prop and load sets**

Change the component signature:
```ts
export function CustomModeBuilder({ onCreated, onCancel, onExisting }: {
  onCreated: (mode: CustomMode, existed: boolean) => void;
  onCancel: () => void;
  onExisting: (mode: CustomMode) => void;
}) {
```

Update the import line to pull the new client helpers and the `SetItem` type:
```ts
import { countFilteredCards, createMode, listSets, findExistingMode, type SetItem } from '../customModes/client';
```

Add state inside the component (after the existing `useState` hooks):
```ts
  const [sets, setSets] = useState<SetItem[]>([]);
  const [setQuery, setSetQuery] = useState('');
  const [existing, setExisting] = useState<CustomMode | null>(null);

  useEffect(() => {
    let cancelled = false;
    listSets().then((s) => { if (!cancelled) setSets(s); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
```

- [ ] **Step 2: Replace the set text input with an autocomplete**

Replace the existing set `<div style={section}>…</div>` block (the "Set code (exclusive)" section, the first block inside the outer container) with:

```tsx
      <div style={section}>
        <span style={legend}>Set filter (exclusive)</span>
        {filter.sets?.length === 1 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span data-testid="set-chosen" style={{ flex: 1, color: 'var(--ink-0)', fontSize: 14 }}>
              {sets.find((s) => s.code === filter.sets![0])?.name ?? filter.sets![0].toUpperCase()}
              {(() => { const y = sets.find((s) => s.code === filter.sets![0])?.released_at?.slice(0, 4); return y ? ` · ${y}` : ''; })()}
            </span>
            <button type="button" className="ghost-btn" style={{ padding: '4px 10px' }}
              onClick={() => { patch({ sets: undefined }); setExisting(null); setSetQuery(''); }}>×</button>
          </div>
        ) : (
          <>
            <input
              type="text" data-testid="set-search" placeholder="Search a set by name — locks out other filters"
              value={setQuery}
              onChange={(e) => setSetQuery(e.target.value)}
              style={{ ...numInput, width: '100%' }}
            />
            {setQuery.trim().length >= 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 180, overflowY: 'auto' }}>
                {sets
                  .filter((s) => s.name.toLowerCase().includes(setQuery.trim().toLowerCase()) || s.code.includes(setQuery.trim().toLowerCase()))
                  .slice(0, 30)
                  .map((s) => (
                    <button key={s.code} type="button" data-testid="set-option"
                      onClick={async () => {
                        patch({ sets: [s.code] });
                        setSetQuery('');
                        const m = await findExistingMode({ sets: [s.code] }).catch(() => null);
                        setExisting(m);
                      }}
                      style={{ textAlign: 'left', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line-strong)',
                        background: 'rgba(20,17,28,0.5)', color: 'var(--ink-1)', cursor: 'pointer', fontSize: 13 }}>
                      {s.name}{s.released_at ? ` · ${s.released_at.slice(0, 4)}` : ''}
                    </button>
                  ))}
              </div>
            )}
          </>
        )}
        {existing && (
          <button type="button" data-testid="existing-mode-link" onClick={() => onExisting(existing)}
            style={{ textAlign: 'left', color: 'var(--ember-hot)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: 0 }}>
            This set already has a mode → View it
          </button>
        )}
      </div>
```

- [ ] **Step 3: Add the Year range row**

In the Ranges block, after the `EDH rank` `RangeRow`, add:
```tsx
        <RangeRow label="Year" value={filter.year} onChange={(r) => patch({ year: r })} />
```

- [ ] **Step 4: Reorder the UB chips and flip the default**

Replace the Universe Beyond chip block with:
```tsx
        <span style={legend}>Universe Beyond</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['no', 'yes', 'only'] as const).map((v) => (
            <Chip key={v} active={(filter.ub ?? 'no') === v} onClick={() => patch({ ub: v })}>
              {v === 'no' ? 'Exclude' : v === 'yes' ? 'Include' : 'Only UB'}
            </Chip>
          ))}
        </div>
```

- [ ] **Step 5: Verify build + existing tests**

Run: `npm run build && npx vitest run`
Expected: build passes; all tests pass (180+).

- [ ] **Step 6: Commit**

```bash
git add src/ui/CustomModeBuilder.tsx
git commit -m "feat: set autocomplete, year filter row, UB-exclude default, existing-mode link"
```

---

### Task 6: Wire `onExisting` through the browser

**Files:**
- Modify: `src/ui/CustomModeBrowser.tsx`

- [ ] **Step 1: Pass an `onExisting` handler to the builder**

In `src/ui/CustomModeBrowser.tsx`, the builder render block currently is:
```tsx
        <CustomModeBuilder
          onCreated={(mode, didExist) => openDetail(mode, didExist)}
          onCancel={backToList}
        />
```
Change it to:
```tsx
        <CustomModeBuilder
          onCreated={(mode, didExist) => openDetail(mode, didExist)}
          onCancel={backToList}
          onExisting={(mode) => openDetail(mode, true)}
        />
```
(`openDetail` already accepts `(mode, didExist)` and switches to the detail view.)

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/ui/CustomModeBrowser.tsx
git commit -m "feat: link to existing mode from the builder set picker"
```

---

### Task 7: Full verification — build, tests, live browser walkthrough

**Files:** none (verification only)

- [ ] **Step 1: Build + full test suite**

Run: `npm run build && npx vitest run`
Expected: build clean; all tests pass.

- [ ] **Step 2: Live RPC sanity checks via Management API**

Run (expect each to return a number / rows):
```sql
-- Year-bounded count (old cards only):
select public.count_filtered_cards('{"year":{"min":1993,"max":1999}}'::jsonb);
-- UB exclude (default) vs include — include should be >= exclude:
select public.count_filtered_cards('{}'::jsonb) as exclude_ub,
       public.count_filtered_cards('{"ub":"yes"}'::jsonb) as include_all;
```
Expected: the year count is > 100 and far below the full pool; `include_all >= exclude_ub`.

- [ ] **Step 3: Browser walkthrough (preview MCP)**

Start the worktree dev server (use a distinct port + `--prefix`; copy `.env` into the worktree first so Supabase is configured). Then in the preview:
1. Home → Custom Mode → Create.
2. Confirm the UB row shows **Exclude** active by default.
3. Type a set name (e.g. "dominaria") in the set search → a dropdown of `Name · YYYY` appears → click one → the form collapses to the chosen set; if a mode already exists, the "This set already has a mode → View it" link appears and opens its detail.
4. Clear the set (×) → set a Year range (e.g. 2015–2020) → the card count updates and stays ≥100 → Create → play one card to confirm gameplay is unchanged.

- [ ] **Step 4: Final commit (if any walkthrough fixes were needed) and finish**

Use superpowers:finishing-a-development-branch to merge/PR and clean up the worktree. Remind the user to rotate the Supabase access token.

---

## Notes for the executor

- The UB default flip is safe because there are **0 production custom modes** (verified at planning time). If that changes before execution, re-check that no stored mode relies on the old "omitted = include" meaning.
- `card_art.set_code` is lowercase; `fetchSets`/the one-time insert lowercases `code` to match.
- Keep the year filter in the custom path: it is disabled along with the rest of the form whenever a single set is chosen (existing `<fieldset disabled={singleSet}>`), and `validateFilter` already trips `single-set-exclusive` if both are set.
