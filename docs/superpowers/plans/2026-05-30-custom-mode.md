# Custom Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a user-buildable "Custom Mode" — a card pool defined by a saved filter, each with its own leaderboard — reusing the existing 90s Time Attack engine unchanged.

**Architecture:** A new `custom_mode` table stores each filter as canonical `jsonb` + a unique `filter_hash` (dedup). Two plpgsql RPCs apply the filter dynamically (`count_filtered_cards`, `get_mode_game_cards`). The existing `leaderboard` table gains a `mode_id` so per-mode boards reuse all existing write/anti-abuse infra. A new `create-mode` edge function validates + persists modes. Client: `PoolSelection` becomes a union; a UI screen-state (`home | custom`) renders the browser/detail/builder screens; picking a mode drops into the existing `loading → playing → gameover` flow.

**Tech Stack:** React + Vite + TypeScript, Zustand, Framer Motion, Vitest; Supabase (Postgres RPC, RLS, Edge Functions/Deno). Project ref `jgapiqpaeaslfpbgiptf`.

**DB/Function deploy mechanism:** Supabase MCP (`apply_migration`, `deploy_edge_function`) once the server is authenticated with the provided `sbp_…` token; CLI fallback `SUPABASE_ACCESS_TOKEN=… npx supabase db push` / `… functions deploy`.

---

## File Structure

**Create:**
- `src/customModes/filter.ts` — `CustomFilter` type, `canonicalizeFilter`, `filterHash`, `modeName`, `validateFilter` (incl. single-set rule), shared color/type/rarity constants.
- `src/customModes/filter.test.ts` — unit tests for the above.
- `src/customModes/client.ts` — `listModes`, `getMode`, `createMode`, `randomMode`, `countFilteredCards`, `fetchModeCandidates`.
- `src/customModes/types.ts` — `CustomMode`, `CustomModeListItem`, `CreateModeResult` row/DTO shapes.
- `src/ui/CustomModeBrowser.tsx` — landing: sorted mode list + selected mode's leaderboard + Create/Random/back.
- `src/ui/CustomModeDetail.tsx` — one mode: filter chips + leaderboard + Play.
- `src/ui/CustomModeBuilder.tsx` — filter form + live count + create-or-find.
- `src/ui/FilterChips.tsx` — render a `CustomFilter` as readable chips (used by browser/detail).
- `supabase/migrations/0003_custom_modes.sql` — table, leaderboard changes, views, RPCs.
- `supabase/functions/create-mode/index.ts` — create/dedupe edge function.

**Modify:**
- `src/scryfall/types.ts` — extend `PoolSelection` to a union.
- `src/cards/client.ts` — `fetchCandidates` branches on `kind==='custom'`.
- `src/state/gameStore.ts` — carry `modeId` through a custom game; key highscores by mode.
- `src/state/highscores.ts` — `PoolKind` allows custom keying.
- `src/leaderboard/client.ts` — `fetchTopScores`/`fetchProjectedRank` accept `mode_id`.
- `src/leaderboard/types.ts` — `SubmitPayload` gains optional `modeId`.
- `src/ui/PoolSelect.tsx` — third "Custom Mode" button (calls an `onOpenCustom` prop).
- `src/App.tsx` — `screen` state (`home | custom`) + render custom screens; thread `onOpenCustom`.
- `src/ui/GameOverLeaderboard.tsx` (and `GameOver.tsx` as needed) — mode-aware board + submit.
- `supabase/functions/submit-score/index.ts` — accept + validate `mode_id` for `pool==='custom'`.

---

## Phase 1 — Pure filter logic (TDD, no DB)

### Task 1: CustomFilter type + canonicalization

**Files:**
- Create: `src/customModes/filter.ts`
- Test: `src/customModes/filter.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { canonicalizeFilter, type CustomFilter } from './filter';

describe('canonicalizeFilter', () => {
  it('drops empty/default fields', () => {
    const f: CustomFilter = { cmc: {}, colors: { values: [], match: 'any' }, types: [] };
    expect(canonicalizeFilter(f)).toEqual({});
  });

  it('sorts array members and object keys deterministically', () => {
    const a = canonicalizeFilter({ types: ['Instant', 'Creature'], rarities: ['rare', 'common'] });
    const b = canonicalizeFilter({ rarities: ['common', 'rare'], types: ['Creature', 'Instant'] });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('keeps colorless C and match mode', () => {
    expect(canonicalizeFilter({ colors: { values: ['R', 'C'], match: 'all' } }))
      .toEqual({ colors: { match: 'all', values: ['C', 'R'] } });
  });

  it('keeps only present cmc bounds', () => {
    expect(canonicalizeFilter({ cmc: { min: 2 } })).toEqual({ cmc: { min: 2 } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/customModes/filter.test.ts`
Expected: FAIL — `canonicalizeFilter` not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
export const COLORS = ['W', 'U', 'B', 'R', 'G', 'C'] as const;
export type ColorCode = (typeof COLORS)[number];
export const CARD_TYPES = ['Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker', 'Land', 'Battle'] as const;
export type CardType = (typeof CARD_TYPES)[number];
export const RARITIES = ['common', 'uncommon', 'rare', 'mythic'] as const;
export type Rarity = (typeof RARITIES)[number];

export interface Range { min?: number; max?: number }

export interface CustomFilter {
  cmc?: Range;
  colors?: { values: ColorCode[]; match: 'any' | 'all' };
  types?: CardType[];
  power?: Range;
  toughness?: Range;
  ub?: 'yes' | 'no' | 'only';
  edhrec?: Range;
  sets?: string[];
  rarities?: Rarity[];
}

function cleanRange(r?: Range): Range | undefined {
  if (!r) return undefined;
  const out: Range = {};
  if (typeof r.min === 'number') out.min = r.min;
  if (typeof r.max === 'number') out.max = r.max;
  return Object.keys(out).length ? out : undefined;
}

function sortUnique<T>(xs: T[], order: readonly T[]): T[] {
  return [...new Set(xs)].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

// Returns a new object with keys inserted in a fixed order and empties dropped,
// so JSON.stringify is stable for hashing.
export function canonicalizeFilter(f: CustomFilter): CustomFilter {
  const out: CustomFilter = {};
  const cmc = cleanRange(f.cmc); if (cmc) out.cmc = cmc;
  if (f.colors && f.colors.values.length) {
    out.colors = { match: f.colors.match, values: sortUnique(f.colors.values, COLORS) };
  }
  if (f.types && f.types.length) out.types = sortUnique(f.types, CARD_TYPES);
  const power = cleanRange(f.power); if (power) out.power = power;
  const toughness = cleanRange(f.toughness); if (toughness) out.toughness = toughness;
  if (f.ub && f.ub !== 'yes') out.ub = f.ub; // 'yes' == no filter == default
  const edhrec = cleanRange(f.edhrec); if (edhrec) out.edhrec = edhrec;
  if (f.sets && f.sets.length) out.sets = [...new Set(f.sets)].sort();
  if (f.rarities && f.rarities.length) out.rarities = sortUnique(f.rarities, RARITIES);
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/customModes/filter.test.ts`
Expected: PASS.

> NOTE: `canonicalizeFilter` inserts keys in a fixed order, but `power`/`toughness` are only meaningful with `types === ['Creature']`. The cross-field rule is enforced by `validateFilter` (Task 4), not here — canonicalize only normalizes shape.

- [ ] **Step 5: Commit**

```bash
git add src/customModes/filter.ts src/customModes/filter.test.ts
git commit -m "feat: CustomFilter type + canonicalization"
```

### Task 2: filterHash (stable dedup key)

**Files:**
- Modify: `src/customModes/filter.ts`
- Test: `src/customModes/filter.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { filterHash } from './filter';

describe('filterHash', () => {
  it('is identical for equivalent filters regardless of input order', async () => {
    const a = await filterHash({ types: ['Instant', 'Creature'], cmc: { max: 3, min: 1 } });
    const b = await filterHash({ cmc: { min: 1, max: 3 }, types: ['Creature', 'Instant'] });
    expect(a).toBe(b);
  });

  it('differs when a bound differs', async () => {
    const a = await filterHash({ cmc: { min: 1 } });
    const b = await filterHash({ cmc: { min: 2 } });
    expect(a).not.toBe(b);
  });

  it('returns a 64-char hex sha256', async () => {
    expect(await filterHash({ ub: 'only' })).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/customModes/filter.test.ts`
Expected: FAIL — `filterHash` not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// Append to filter.ts. Uses Web Crypto (available in the browser + Deno + jsdom test env).
export async function filterHash(f: CustomFilter): Promise<string> {
  const json = JSON.stringify(canonicalizeFilter(f));
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/customModes/filter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/customModes/filter.ts src/customModes/filter.test.ts
git commit -m "feat: stable filterHash for mode dedup"
```

### Task 3: modeName (auto-generated label)

**Files:**
- Modify: `src/customModes/filter.ts`
- Test: `src/customModes/filter.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { modeName } from './filter';

describe('modeName', () => {
  it('names mono-color creatures with a cmc range', () => {
    expect(modeName({ colors: { values: ['R'], match: 'any' }, types: ['Creature'], cmc: { min: 1, max: 3 } }))
      .toBe('Mono-Red Creatures · CMC 1–3');
  });
  it('joins multiple types and shows EDH ceiling', () => {
    expect(modeName({ types: ['Instant', 'Sorcery'], edhrec: { max: 500 } }))
      .toBe('Instants & Sorceries · EDH ≤500');
  });
  it('falls back to a generic label for an empty filter', () => {
    expect(modeName({})).toBe('All cards (custom)');
  });
  it('labels UB-only and rarity', () => {
    expect(modeName({ ub: 'only', rarities: ['mythic'] })).toBe('Universe Beyond · Mythic');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/customModes/filter.test.ts`
Expected: FAIL — `modeName` not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// Append to filter.ts.
const COLOR_WORD: Record<ColorCode, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green', C: 'Colorless' };
const TYPE_PLURAL: Record<CardType, string> = {
  Creature: 'Creatures', Instant: 'Instants', Sorcery: 'Sorceries', Artifact: 'Artifacts',
  Enchantment: 'Enchantments', Planeswalker: 'Planeswalkers', Land: 'Lands', Battle: 'Battles',
};

function rangeLabel(prefix: string, r?: Range): string | null {
  if (!r || (r.min == null && r.max == null)) return null;
  if (r.min != null && r.max != null) return `${prefix} ${r.min}–${r.max}`;
  if (r.min != null) return `${prefix} ≥${r.min}`;
  return `${prefix} ≤${r.max}`;
}

export function modeName(filter: CustomFilter): string {
  const f = canonicalizeFilter(filter);
  const parts: string[] = [];

  // Color + type form the headline.
  let head = '';
  if (f.colors) {
    const words = f.colors.values.map((c) => COLOR_WORD[c]);
    if (f.colors.values.length === 1) head = `Mono-${words[0]}`;
    else head = (f.colors.match === 'all' ? words.join('+') : words.join('/'));
  }
  const typeWords = (f.types ?? []).map((t) => TYPE_PLURAL[t]);
  const typeLabel = typeWords.length
    ? typeWords.slice(0, -1).join(', ') + (typeWords.length > 1 ? ' & ' : '') + typeWords[typeWords.length - 1]
    : '';
  const headline = [head, typeLabel || (head ? 'Cards' : '')].filter(Boolean).join(' ');
  if (headline) parts.push(headline);

  const cmc = rangeLabel('CMC', f.cmc); if (cmc) parts.push(cmc);
  const pow = rangeLabel('Pow', f.power); if (pow) parts.push(pow);
  const tou = rangeLabel('Tou', f.toughness); if (tou) parts.push(tou);
  const edh = rangeLabel('EDH', f.edhrec); if (edh) parts.push(edh);
  if (f.ub === 'only') parts.push('Universe Beyond');
  if (f.ub === 'no') parts.push('No UB');
  if (f.sets?.length) parts.push(f.sets.length === 1 ? f.sets[0].toUpperCase() : `${f.sets.length} sets`);
  if (f.rarities?.length) parts.push(f.rarities.map((r) => r[0].toUpperCase() + r.slice(1)).join('/'));

  return parts.length ? parts.join(' · ') : 'All cards (custom)';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/customModes/filter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/customModes/filter.ts src/customModes/filter.test.ts
git commit -m "feat: auto-generated mode names"
```

### Task 4: validateFilter (bounds + single-set rule)

**Files:**
- Modify: `src/customModes/filter.ts`
- Test: `src/customModes/filter.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { validateFilter } from './filter';

describe('validateFilter', () => {
  it('accepts a normal filter', () => {
    expect(validateFilter({ types: ['Creature'], cmc: { min: 1, max: 4 } })).toEqual({ ok: true });
  });
  it('rejects power/toughness unless types is exactly [Creature]', () => {
    expect(validateFilter({ types: ['Creature', 'Instant'], power: { min: 2 } }))
      .toEqual({ ok: false, reason: 'pt-requires-creature' });
    expect(validateFilter({ power: { min: 2 } })).toEqual({ ok: false, reason: 'pt-requires-creature' });
  });
  it('rejects extra filters when exactly one set is selected', () => {
    expect(validateFilter({ sets: ['dom'], cmc: { min: 1 } })).toEqual({ ok: false, reason: 'single-set-exclusive' });
    expect(validateFilter({ sets: ['dom'] })).toEqual({ ok: true });
  });
  it('rejects inverted ranges', () => {
    expect(validateFilter({ cmc: { min: 5, max: 2 } })).toEqual({ ok: false, reason: 'bad-range' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/customModes/filter.test.ts`
Expected: FAIL — `validateFilter` not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// Append to filter.ts.
export type ValidateResult = { ok: true } | { ok: false; reason: string };

function rangeOrdered(r?: Range): boolean {
  return !r || r.min == null || r.max == null || r.min <= r.max;
}

export function validateFilter(filter: CustomFilter): ValidateResult {
  const f = canonicalizeFilter(filter);
  for (const r of [f.cmc, f.power, f.toughness, f.edhrec]) {
    if (!rangeOrdered(r)) return { ok: false, reason: 'bad-range' };
  }
  const hasPT = !!(f.power || f.toughness);
  const creatureOnly = f.types?.length === 1 && f.types[0] === 'Creature';
  if (hasPT && !creatureOnly) return { ok: false, reason: 'pt-requires-creature' };

  if (f.sets?.length === 1) {
    const otherKeys = Object.keys(f).filter((k) => k !== 'sets');
    if (otherKeys.length > 0) return { ok: false, reason: 'single-set-exclusive' };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/customModes/filter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/customModes/filter.ts src/customModes/filter.test.ts
git commit -m "feat: validateFilter (bounds, P/T-creature, single-set)"
```

---

## Phase 2 — Database (migration `0003_custom_modes.sql`)

> Apply each migration via Supabase MCP `apply_migration` (project `jgapiqpaeaslfpbgiptf`) once the server is authenticated, OR `SUPABASE_ACCESS_TOKEN=… npx supabase db push`. After applying, verify with a read query. Write the SQL into the migration file too, so the repo stays the source of truth.

### Task 5: custom_mode table + leaderboard changes + views

**Files:**
- Create: `supabase/migrations/0003_custom_modes.sql`

- [ ] **Step 1: Write the migration SQL (table + leaderboard + views)**

```sql
-- Custom modes: a user-built filter saved as canonical jsonb. Each mode has its
-- own leaderboard (via leaderboard.mode_id). Writes happen only through the
-- create-mode edge function (service role); reads are public.
create table public.custom_mode (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  filter      jsonb not null,
  filter_hash text not null unique,
  card_count  int  not null,
  created_at  timestamptz not null default now()
);
alter table public.custom_mode enable row level security;
create policy custom_mode_read on public.custom_mode for select using (true);

-- Per-mode leaderboard: reuse the existing locked-down table + submit-score path.
alter table public.leaderboard add column mode_id uuid references public.custom_mode(id);
alter table public.leaderboard drop constraint leaderboard_pool_check;
alter table public.leaderboard add constraint leaderboard_pool_check
  check (pool in ('popular', 'all', 'custom'));
alter table public.leaderboard add constraint leaderboard_mode_id_check
  check ((pool = 'custom') = (mode_id is not null));
create index leaderboard_mode_score_idx
  on public.leaderboard (mode_id, score desc, created_at asc);

-- Recreate the public read view to expose mode_id.
drop view public.leaderboard_top;
create view public.leaderboard_top as
  select id, name, score, correct, pool, mode_id, country, created_at
  from public.leaderboard;
grant select on public.leaderboard_top to anon;

-- Landing list: every mode + its leaderboard entry count, for popularity sort.
create view public.custom_mode_list as
  select m.id, m.name, m.filter, m.card_count, m.created_at,
         count(l.id) as entry_count
  from public.custom_mode m
  left join public.leaderboard l on l.mode_id = m.id
  group by m.id;
grant select on public.custom_mode_list to anon;
```

> NOTE: confirm the existing pool check constraint is named `leaderboard_pool_check` first (`select conname from pg_constraint where conrelid = 'public.leaderboard'::regclass`). If it has a generated name, substitute it in the `drop constraint` line.

- [ ] **Step 2: Apply + verify**

Apply via MCP `apply_migration` (name `custom_modes`). Then verify:
Run query: `select count(*) from public.custom_mode;` → Expected: `0`.
Run query: `select column_name from information_schema.columns where table_name='leaderboard' and column_name='mode_id';` → Expected: one row.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0003_custom_modes.sql
git commit -m "feat: custom_mode table + per-mode leaderboard schema"
```

### Task 6: count_filtered_cards RPC

**Files:**
- Modify: `supabase/migrations/0003_custom_modes.sql` (append)

- [ ] **Step 1: Append the count RPC**

```sql
-- Count cards matching a filter. Used for the live builder preview and the >=100
-- creation gate. Values are read out of jsonb and bound as typed locals; column
-- identifiers are fixed here (no dynamic identifier concatenation).
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
    -- Power/Toughness: guarded numeric cast; non-numeric (* / 1+*) excluded from ranges.
    and (p_filter->'power'->>'min' is null or (c.power ~ '^[0-9]+$' and c.power::int >= (p_filter->'power'->>'min')::int))
    and (p_filter->'power'->>'max' is null or (c.power ~ '^[0-9]+$' and c.power::int <= (p_filter->'power'->>'max')::int))
    and (p_filter->'toughness'->>'min' is null or (c.toughness ~ '^[0-9]+$' and c.toughness::int >= (p_filter->'toughness'->>'min')::int))
    and (p_filter->'toughness'->>'max' is null or (c.toughness ~ '^[0-9]+$' and c.toughness::int <= (p_filter->'toughness'->>'max')::int))
    -- UB
    and (v_ub is null or v_ub = 'yes'
         or (v_ub = 'no' and not c.is_ub)
         or (v_ub = 'only' and c.is_ub))
    -- Colors: 'any' => overlap, 'all' => contains. Colorless 'C' => empty colors[].
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
    -- Types: OR of substring matches on type_line.
    and (cardinality(v_types) = 0 or exists (
      select 1 from unnest(v_types) t where c.type_line ilike '%' || t || '%'
    ))
    -- Sets / rarity live on printings (card_art).
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
```

- [ ] **Step 2: Apply + verify against known data**

Apply via MCP. Verify a few:
`select public.count_filtered_cards('{}'::jsonb);` → Expected: ~25206 (whole catalogue).
`select public.count_filtered_cards('{"ub":"only"}'::jsonb);` → Expected: ~3214.
`select public.count_filtered_cards('{"colors":{"values":["R"],"match":"any"},"types":["Creature"]}'::jsonb);` → Expected: > 100 (sanity).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0003_custom_modes.sql
git commit -m "feat: count_filtered_cards RPC"
```

### Task 7: get_mode_game_cards RPC

**Files:**
- Modify: `supabase/migrations/0003_custom_modes.sql` (append)

- [ ] **Step 1: Append the play RPC**

```sql
-- Random distinct cards for one custom game, same row shape as get_game_cards.
-- Reads the stored filter by mode id (mode is authoritative). When sets/rarities
-- are set, the lateral art-join is restricted to a matching printing so the shown
-- art actually belongs to the filtered set/rarity.
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
      and (p_filter->'power'->>'min' is null or (c.power ~ '^[0-9]+$' and c.power::int >= (p_filter->'power'->>'min')::int))
      and (p_filter->'power'->>'max' is null or (c.power ~ '^[0-9]+$' and c.power::int <= (p_filter->'power'->>'max')::int))
      and (p_filter->'toughness'->>'min' is null or (c.toughness ~ '^[0-9]+$' and c.toughness::int >= (p_filter->'toughness'->>'min')::int))
      and (p_filter->'toughness'->>'max' is null or (c.toughness ~ '^[0-9]+$' and c.toughness::int <= (p_filter->'toughness'->>'max')::int))
      and (v_ub is null or v_ub = 'yes' or (v_ub = 'no' and not c.is_ub) or (v_ub = 'only' and c.is_ub))
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

- [ ] **Step 2: Apply + verify**

Apply via MCP. Insert a throwaway mode row and query:
```sql
insert into public.custom_mode (name, filter, filter_hash, card_count)
values ('tmp', '{"ub":"only"}'::jsonb, 'tmp-hash', 3214) returning id;
select count(*) from public.get_mode_game_cards('<that-id>', 20);
```
Expected: 20 rows, each with image + rarity. Then `delete from public.custom_mode where filter_hash='tmp-hash';`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0003_custom_modes.sql
git commit -m "feat: get_mode_game_cards RPC with matching-printing art"
```

---

## Phase 3 — Edge functions

### Task 8: create-mode edge function

**Files:**
- Create: `supabase/functions/create-mode/index.ts`

- [ ] **Step 1: Write the function**

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const MIN_CARDS = 100;
const RATE_MAX = 10;
const RATE_WINDOW_MS = 60_000;

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, reason: 'method' }, 405);

  let body: { filter?: unknown; name?: unknown; filter_hash?: unknown };
  try { body = await req.json(); } catch { return json({ ok: false, reason: 'bad-json' }, 400); }
  const filter = body.filter;
  const name = typeof body.name === 'string' ? body.name.slice(0, 120) : null;
  const filterHash = typeof body.filter_hash === 'string' && /^[0-9a-f]{64}$/.test(body.filter_hash) ? body.filter_hash : null;
  if (!filter || typeof filter !== 'object' || !name || !filterHash) return json({ ok: false, reason: 'bad-filter' }, 400);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Rate limit by IP hash (reuse the submit-score salt).
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  const ipHash = await sha256(ip + (Deno.env.get('IP_HASH_SALT') ?? ''));

  // Dedup: if a mode with this hash exists, return it.
  const existing = await supabase.from('custom_mode').select('id,name,filter,card_count').eq('filter_hash', filterHash).maybeSingle();
  if (existing.data) return json({ ok: true, existed: true, mode: existing.data });

  // Authoritative count (server recomputes; client value is not trusted).
  const counted = await supabase.rpc('count_filtered_cards', { p_filter: filter });
  if (counted.error) return json({ ok: false, reason: 'count' }, 500);
  const cardCount = counted.data as number;
  if (cardCount < MIN_CARDS) return json({ ok: false, reason: 'too-few', count: cardCount }, 400);

  const inserted = await supabase.from('custom_mode')
    .insert({ name, filter, filter_hash: filterHash, card_count: cardCount })
    .select('id,name,filter,card_count').single();
  if (inserted.error) {
    // Lost a race on the unique hash → fetch and return the winner.
    const again = await supabase.from('custom_mode').select('id,name,filter,card_count').eq('filter_hash', filterHash).maybeSingle();
    if (again.data) return json({ ok: true, existed: true, mode: again.data });
    return json({ ok: false, reason: 'insert' }, 500);
  }
  return json({ ok: true, existed: false, mode: inserted.data });
});
```

> NOTE: this function trusts the client `name`/`filter_hash` for storage but recomputes `card_count` server-side (the gate). Since names are cosmetic and derived from the filter, regenerating server-side is optional; if desired later, port `modeName` to a `_shared` Deno module. Rate-limit table reuse is out of scope unless abuse appears (RATE_MAX kept generous).

- [ ] **Step 2: Deploy + smoke test**

Deploy via MCP `deploy_edge_function` (name `create-mode`) or `… npx supabase functions deploy create-mode`. Then from the app or curl, POST a `{ ub: 'only' }` filter and confirm `{ ok:true }` with a mode id; POST it again and confirm `existed: true` with the same id.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/create-mode/index.ts
git commit -m "feat: create-mode edge function (validate, dedupe, gate)"
```

### Task 9: submit-score accepts mode_id

**Files:**
- Modify: `supabase/functions/submit-score/index.ts`

- [ ] **Step 1: Add mode handling**

Replace the pool check (lines ~73-74) and the insert/rank blocks so that `pool === 'custom'` requires a valid `mode_id`:

```ts
  const pool = body.pool;
  if (pool !== 'popular' && pool !== 'all' && pool !== 'custom') return json({ ok: false, reason: 'pool' }, 400);

  let modeId: string | null = null;
  if (pool === 'custom') {
    const raw = body.mode_id;
    if (typeof raw !== 'string' || !/^[0-9a-f-]{36}$/.test(raw)) return json({ ok: false, reason: 'mode' }, 400);
    modeId = raw;
  }
```

After `createClient(...)` and before insert, validate the mode exists:

```ts
  if (modeId) {
    const m = await supabase.from('custom_mode').select('id', { head: true, count: 'exact' }).eq('id', modeId);
    if ((m.count ?? 0) === 0) return json({ ok: false, reason: 'mode-not-found' }, 400);
  }
```

Update the insert to include `mode_id`:

```ts
  const inserted = await supabase
    .from('leaderboard')
    .insert({ name, score, correct, pool, mode_id: modeId, country, ip_hash: ipHash })
    .select('id')
    .single();
```

Update the rank query to scope by mode for custom:

```ts
  let rankQuery = supabase.from('leaderboard').select('id', { count: 'exact', head: true }).gt('score', score);
  rankQuery = modeId ? rankQuery.eq('mode_id', modeId) : rankQuery.eq('pool', pool);
  const higher = await rankQuery;
  const rank = (higher.count ?? 0) + 1;
```

- [ ] **Step 2: Deploy + smoke test**

Deploy. Submit a score with `pool:'custom', mode_id:'<real id>'` → `{ ok:true }`; with a bogus mode_id → `{ ok:false, reason:'mode-not-found' }`.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/submit-score/index.ts
git commit -m "feat: submit-score supports custom mode_id"
```

---

## Phase 4 — Client data layer

### Task 10: PoolSelection union + DTO types

**Files:**
- Modify: `src/scryfall/types.ts`
- Create: `src/customModes/types.ts`

- [ ] **Step 1: Extend PoolSelection**

In `src/scryfall/types.ts`, replace the existing `PoolSelection` with:

```ts
export type PoolSelection =
  | { kind: 'popular' | 'all'; excludeUniverseBeyond: boolean }
  | { kind: 'custom'; modeId: string; filter: import('../customModes/filter').CustomFilter; name: string };
```

- [ ] **Step 2: Add DTO types**

`src/customModes/types.ts`:

```ts
import type { CustomFilter } from './filter';

export interface CustomMode {
  id: string;
  name: string;
  filter: CustomFilter;
  card_count: number;
}
export interface CustomModeListItem extends CustomMode {
  entry_count: number;
}
export type CreateModeResult =
  | { ok: true; existed: boolean; mode: CustomMode }
  | { ok: false; reason: string; count?: number };
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run build`
Expected: PASS (type-check). Fix any narrowing errors in existing `PoolSelection` consumers (e.g. `gameStore.selectPool`) — those are handled in Task 12; if build fails only there, proceed to Task 12 before committing.

- [ ] **Step 4: Commit**

```bash
git add src/scryfall/types.ts src/customModes/types.ts
git commit -m "feat: PoolSelection union + custom mode DTOs"
```

### Task 11: customModes/client.ts

**Files:**
- Create: `src/customModes/client.ts`

- [ ] **Step 1: Write the client**

```ts
import { getSupabase } from '../supabase/client';
import { rowToCard, type GameCardRow } from '../cards/client';
import type { ScryfallCard } from '../scryfall/types';
import { canonicalizeFilter, filterHash, modeName, type CustomFilter } from './filter';
import type { CreateModeResult, CustomMode, CustomModeListItem } from './types';

export async function countFilteredCards(filter: CustomFilter): Promise<number> {
  const c = getSupabase();
  if (!c) return 0;
  const { data, error } = await c.rpc('count_filtered_cards', { p_filter: canonicalizeFilter(filter) });
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}

export async function listModes(limit = 50): Promise<CustomModeListItem[]> {
  const c = getSupabase();
  if (!c) return [];
  const { data, error } = await c.from('custom_mode_list')
    .select('id,name,filter,card_count,entry_count')
    .order('entry_count', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as CustomModeListItem[];
}

export async function getMode(id: string): Promise<CustomMode | null> {
  const c = getSupabase();
  if (!c) return null;
  const { data, error } = await c.from('custom_mode').select('id,name,filter,card_count').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CustomMode) ?? null;
}

export async function randomMode(): Promise<CustomModeListItem | null> {
  const modes = await listModes(200);
  if (modes.length === 0) return null;
  return modes[Math.floor(Math.random() * modes.length)];
}

export async function createMode(filter: CustomFilter): Promise<CreateModeResult> {
  const c = getSupabase();
  if (!c) return { ok: false, reason: 'disabled' };
  const canonical = canonicalizeFilter(filter);
  const payload = { filter: canonical, name: modeName(canonical), filter_hash: await filterHash(canonical) };
  const { data, error } = await c.functions.invoke('create-mode', { body: payload });
  if (error) return { ok: false, reason: error.message };
  return data as CreateModeResult;
}

export async function fetchModeCandidates(modeId: string, limit = 175): Promise<ScryfallCard[]> {
  const c = getSupabase();
  if (!c) throw new Error('Card database is not configured.');
  const { data, error } = await c.rpc('get_mode_game_cards', { p_mode_id: modeId, p_count: limit });
  if (error) throw new Error(error.message);
  return ((data ?? []) as GameCardRow[]).map(rowToCard);
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/customModes/client.ts
git commit -m "feat: custom mode client (list/get/create/random/count/candidates)"
```

### Task 12: fetchCandidates branch + store custom support

**Files:**
- Modify: `src/cards/client.ts:59-64`, `src/state/gameStore.ts`, `src/state/highscores.ts`

- [ ] **Step 1: Branch fetchCandidates**

In `src/cards/client.ts`, change `fetchCandidates`:

```ts
import { fetchModeCandidates } from '../customModes/client';

export function fetchCandidates(input: PoolSelection, limit = DEFAULT_LIMIT): Promise<ScryfallCard[]> {
  if (input.kind === 'custom') return fetchModeCandidates(input.modeId, limit);
  return queryGameCards(input.kind, limit, input.excludeUniverseBeyond);
}
```

- [ ] **Step 2: Thread modeId through the store**

In `src/state/gameStore.ts`: add `currentModeId: string | null` to state (default `null`); in `selectPool`, set `currentModeId: selection.kind === 'custom' ? selection.modeId : null` and `poolKind: selection.kind === 'custom' ? 'custom' : selection.kind`. In `finishGame`, accept and pass `modeId` so the highscore/leaderboard submit can use it (store `currentModeId` in the gameover snapshot the GameOver UI reads).

```ts
// state additions
currentModeId: null as string | null,
// inside selectPool's set({...})
poolKind: selection.kind === 'custom' ? 'custom' : selection.kind,
currentModeId: selection.kind === 'custom' ? selection.modeId : null,
```

- [ ] **Step 3: Allow custom PoolKind**

In `src/state/highscores.ts`, widen `PoolKind`:

```ts
export type PoolKind = 'popular' | 'all' | 'custom';
```

For custom games, key the localStorage highscore by mode: store under `custom:<modeId>` (extend `saveHighscore`/`loadHighscores` keying, or skip local highscore for custom and rely on the global board — choose skip-local for custom to keep storage simple, gated by `if (poolKind !== 'custom')`).

- [ ] **Step 4: Verify build + existing tests**

Run: `npm run build && npm run test`
Expected: PASS (existing 137 tests still green; the `PoolSelection` union now type-checks everywhere).

- [ ] **Step 5: Commit**

```bash
git add src/cards/client.ts src/state/gameStore.ts src/state/highscores.ts
git commit -m "feat: route custom mode through store + card fetch"
```

### Task 13: leaderboard client mode support

**Files:**
- Modify: `src/leaderboard/client.ts`, `src/leaderboard/types.ts`

- [ ] **Step 1: Add mode_id to reads + submit payload**

In `src/leaderboard/types.ts`, add optional `modeId?: string` to `SubmitPayload`.
In `src/leaderboard/client.ts`, add mode-scoped variants (or an optional `modeId` arg):

```ts
export async function fetchModeTopScores(modeId: string, limit = 5, since: number | null = null): Promise<GlobalEntry[]> {
  const c = getSupabase();
  if (!c) return [];
  let q = c.from('leaderboard_top').select('id,name,score,correct,pool,country,created_at').eq('mode_id', modeId);
  if (since != null) q = q.gte('created_at', new Date(since).toISOString());
  const { data, error } = await q.order('score', { ascending: false }).order('created_at', { ascending: true }).limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(toEntry);
}

export async function fetchModeProjectedRank(modeId: string, score: number): Promise<{ rank: number; total: number }> {
  const c = getSupabase();
  if (!c) return { rank: 1, total: 0 };
  const higher = await c.from('leaderboard_top').select('id', { count: 'exact', head: true }).eq('mode_id', modeId).gt('score', score);
  const all = await c.from('leaderboard_top').select('id', { count: 'exact', head: true }).eq('mode_id', modeId);
  if (higher.error) throw new Error(higher.error.message);
  if (all.error) throw new Error(all.error.message);
  return { rank: (higher.count ?? 0) + 1, total: all.count ?? 0 };
}
```

In `submitScore`, include `mode_id: payload.modeId` in the body when present.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/leaderboard/client.ts src/leaderboard/types.ts
git commit -m "feat: mode-scoped leaderboard reads + submit"
```

---

## Phase 5 — UI

### Task 14: Custom Mode button + screen state

**Files:**
- Modify: `src/ui/PoolSelect.tsx`, `src/App.tsx`

- [ ] **Step 1: Add the button**

In `PoolSelect.tsx`, accept `onOpenCustom: () => void` and add a third button below "All cards":

```tsx
<button style={btn} onClick={onOpenCustom}>
  Custom Mode
  <span style={sub}>Build &amp; play your own filter</span>
  <PlayIcon hint={hint} />
</button>
```

- [ ] **Step 2: Add screen state to App**

In `App.tsx`, add `const [screen, setScreen] = useState<'home' | 'custom'>('home');`. Pass `onOpenCustom={() => setScreen('custom')}` to `<PoolSelect />`. When `phase === 'idle' && screen === 'custom'`, render `<CustomModeBrowser onBack={() => setScreen('home')} />` instead of the home leaderboard/PoolSelect block. Reset `screen` to `'home'` whenever a game starts (in the `phase` effect or on `selectPool`).

- [ ] **Step 3: Verify in preview**

Start dev server (`preview_start`), confirm the third button renders and clicking it shows the (empty) custom screen, back returns home.

- [ ] **Step 4: Commit**

```bash
git add src/ui/PoolSelect.tsx src/App.tsx
git commit -m "feat: Custom Mode entry button + screen routing"
```

### Task 15: CustomModeBrowser (landing)

**Files:**
- Create: `src/ui/CustomModeBrowser.tsx`, `src/ui/FilterChips.tsx`

- [ ] **Step 1: FilterChips**

`FilterChips.tsx`: a presentational component that renders a `CustomFilter` as small chips (reuse `modeName` parts or render each field). Minimal:

```tsx
import { modeName, type CustomFilter } from '../customModes/filter';
export function FilterChips({ filter }: { filter: CustomFilter }) {
  const label = modeName(filter);
  return <div className="filter-chips">{label.split(' · ').map((p) => <span key={p} className="chip">{p}</span>)}</div>;
}
```

- [ ] **Step 2: Browser**

`CustomModeBrowser.tsx`: on mount `listModes()`; show list sorted by `entry_count` (name + `<FilterChips>` + entry count + tap → `onSelect(mode)`); render the most-played mode's leaderboard up top using `fetchModeTopScores(modes[0].id)`; buttons **Create** (→ builder) and **Random** (`randomMode()` → detail); a back arrow. Manage sub-screen locally: `view: 'list' | 'detail' | 'builder'` with the selected mode.

```tsx
// sketch of state + handlers
const [modes, setModes] = useState<CustomModeListItem[]>([]);
const [view, setView] = useState<'list' | 'detail' | 'builder'>('list');
const [selected, setSelected] = useState<CustomMode | null>(null);
useEffect(() => { listModes().then(setModes).catch(() => setModes([])); }, []);
// Random
const onRandom = async () => { const m = await randomMode(); if (m) { setSelected(m); setView('detail'); } };
```

- [ ] **Step 3: Verify in preview**

Confirm list renders (empty until modes exist), Create opens builder, Random no-ops gracefully when empty.

- [ ] **Step 4: Commit**

```bash
git add src/ui/CustomModeBrowser.tsx src/ui/FilterChips.tsx
git commit -m "feat: custom mode browser landing + filter chips"
```

### Task 16: CustomModeBuilder (filter form + live count)

**Files:**
- Create: `src/ui/CustomModeBuilder.tsx`

- [ ] **Step 1: Build the form**

Controlled inputs for each filter field; local `filter: CustomFilter` state. Debounced `countFilteredCards(filter)` on change shows "N cards — playable" (≥100) or "N cards — need ≥100" (disables Create). Enforce UI rules: Power/Toughness inputs only when `types === ['Creature']`; when exactly one set selected, disable all other inputs (`validateFilter` gates the Create button too). On Create: `createMode(filter)` → on `ok` call `onCreated(result.mode, result.existed)` (parent shows detail, with a small "this mode already existed" note when `existed`).

```tsx
const [filter, setFilter] = useState<CustomFilter>({});
const [count, setCount] = useState<number | null>(null);
useEffect(() => {
  const v = validateFilter(filter);
  if (!v.ok) { setCount(null); return; }
  const id = setTimeout(() => { countFilteredCards(filter).then(setCount).catch(() => setCount(null)); }, 300);
  return () => clearTimeout(id);
}, [filter]);
const canCreate = validateFilter(filter).ok && (count ?? 0) >= 100;
```

- [ ] **Step 2: Verify in preview**

Build a filter (e.g. Red + Creature), confirm count updates live and Create is disabled below 100; confirm P/T inputs appear only for Creature-only; confirm single-set disables others.

- [ ] **Step 3: Commit**

```bash
git add src/ui/CustomModeBuilder.tsx
git commit -m "feat: custom mode builder with live card count"
```

### Task 17: CustomModeDetail (filters + leaderboard + Play)

**Files:**
- Create: `src/ui/CustomModeDetail.tsx`

- [ ] **Step 1: Build the detail screen**

Props: `mode: CustomMode`, `onBack`, `onPlay`. Render `<FilterChips filter={mode.filter} />`, the mode's leaderboard (`fetchModeTopScores(mode.id)` with the existing `Leaderboard`/entry-row styling), and a **Play** button that calls `onPlay(mode)`. The parent wires `onPlay` to `useGameStore.selectPool({ kind: 'custom', modeId: mode.id, filter: mode.filter, name: mode.name })`.

- [ ] **Step 2: Verify in preview**

With a created mode, open detail, confirm chips + leaderboard render and Play starts a game (summon → playing).

- [ ] **Step 3: Commit**

```bash
git add src/ui/CustomModeDetail.tsx
git commit -m "feat: custom mode detail screen with play"
```

### Task 18: Mode-aware game over

**Files:**
- Modify: `src/ui/GameOverLeaderboard.tsx`, `src/ui/GameOver.tsx`

- [ ] **Step 1: Wire mode context**

Read `currentModeId` (and mode name) from the store. When set, `GameOverLeaderboard` uses `fetchModeTopScores`/`fetchModeProjectedRank` instead of the pool variants, and `submitScore` includes `modeId`. Header shows the mode name instead of "Popular/All cards". Restart replays the same mode (already handled by `restart` → `selectPool(lastSelection)`).

- [ ] **Step 2: Verify in preview**

Finish a custom game, confirm the gameover board is the mode's board, submitting a score appears in that board (and not in popular/all).

- [ ] **Step 3: Commit**

```bash
git add src/ui/GameOverLeaderboard.tsx src/ui/GameOver.tsx
git commit -m "feat: mode-aware game over leaderboard + submit"
```

---

## Phase 6 — End-to-end verification

### Task 19: Full build, tests, and browser walkthrough

- [ ] **Step 1: Build + unit tests**

Run: `npm run build && npm run test`
Expected: PASS, including the new `filter.test.ts`.

- [ ] **Step 2: Browser walkthrough (preview)**

1. Home → Custom Mode → builder: create "Mono-Red Creatures" (confirm ≥100, name auto-generated).
2. Creating the same filter again returns the existing mode ("already exists").
3. Detail → Play → play a few rounds → game over → submit score → score shows in the mode's board only.
4. Back to browser → mode appears in the list sorted by entries; Random opens a mode detail.
5. Verify cards shown actually match the filter (Red creatures), and a Set/Rarity mode shows matching-printing art.

- [ ] **Step 3: Final commit / branch ready**

```bash
git add -A && git commit -m "test: custom mode end-to-end verification notes" --allow-empty
```

Then hand off via superpowers:finishing-a-development-branch.

---

## Self-Review notes (author)

- **Spec coverage:** CMC/Colors(+AND-OR)/Type/Power-Toughness(creature-only)/UB/EDH/Set(single-set rule)/Rarity → Tasks 1,4,6,7,16. ≥100 gate → Tasks 6,8,16. Auto-name → Task 3,8. Dedup → Tasks 2,5,8. Per-mode board → Tasks 5,9,13,18. Landing (sorted + leaderboard) → Task 15. Detail-before-play → Task 17. Random → Tasks 11,15. Third button → Task 14.
- **Power/Toughness are text:** handled by guarded regex cast in SQL (Tasks 6,7).
- **Set/Rarity on printings:** EXISTS + matching-printing art join (Tasks 6,7).
- **Engine untouched:** custom only changes the candidate source (Task 12).
