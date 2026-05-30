# Card-Data Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move card data from the live Scryfall API into Supabase — a seed script loads a filtered subset of `all-cards.json` into a normalized schema, and the app reads cards (with random artwork) from Supabase, giving a 5× popular pool, artwork cycling, and fresh cards on every restart.

**Architecture:** Two Postgres tables — `card` (one row per guessable card) and `card_art` (one row per eligible printing) — plus an RPC `get_game_cards(pool, count, exclude_ub)` that returns random distinct cards each joined to one random artwork. A local Node seed script streams the 2.4 GB bulk file, filters printings, and batch-inserts via the service-role key. On the client, a new `src/cards/client.ts` replaces `src/scryfall/client.ts`, mapping RPC rows onto the existing `ScryfallCard` type so `planGame`/`gameStore`/UI are untouched.

**Tech Stack:** Supabase (Postgres + RPC), TypeScript, React/Zustand, Vite, Vitest. Seed script: Node + `tsx` + `stream-json` + `dotenv` + `@supabase/supabase-js` (service role).

**Reference spec:** `docs/superpowers/specs/2026-05-30-card-data-backend-design.md`

**Supabase project:** ref `jgapiqpaeaslfpbgiptf`.

---

## File structure

| File | Responsibility |
|------|----------------|
| `src/supabase/client.ts` (create) | Shared cached `getSupabase()` (extracted from leaderboard) — anon client for app reads |
| `src/leaderboard/client.ts` (modify) | Use shared `getSupabase()` instead of its private `getClient()` |
| `supabase/migrations/0002_cards.sql` (create) | `card` + `card_art` tables, indexes, RLS read policy, `reset_cards()` + `get_game_cards()` RPCs, grants |
| `src/cards/seedFilter.ts` (create) | Pure functions: `isEligiblePrinting`, `toCardFields`, `toArtFields`, `topPopularOracleIds` — testable, no I/O |
| `src/cards/seedFilter.test.ts` (create) | Unit tests for the pure seed logic |
| `scripts/seed-cards.ts` (create) | Thin orchestration: UB lookup, stream `all-cards.json`, group, insert via service role |
| `src/cards/client.ts` (create) | `rowToCard`, `fetchCandidates`, `fetchRandomCard` backed by the RPC |
| `src/cards/client.test.ts` (create) | Unit tests for mapping + RPC calls (mocked client) |
| `src/state/gameStore.ts` (modify) | Import `fetchCandidates` from `../cards/client` |
| `src/App.tsx` (modify) | Import `fetchRandomCard` from `./cards/client` |
| `src/scryfall/client.ts` (delete) | Replaced by `src/cards/client.ts` |
| `src/scryfall/client.test.ts` (delete) | Tests for the removed Scryfall fetcher |
| `src/scryfall/types.ts` (keep) | `ScryfallCard`, `PoolSelection`, `Color` remain the internal card shape |
| `package.json` (modify) | Add devDeps + `seed:cards` script |
| `.env.example` (modify) | Document seed env vars |

---

## Task 1: Shared Supabase client module

**Files:**
- Create: `src/supabase/client.ts`
- Modify: `src/leaderboard/client.ts:1-17`

- [ ] **Step 1: Create the shared client module**

Create `src/supabase/client.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null | undefined;

/** Lazily create a cached anon Supabase client, or null if env is missing. */
export function getSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  cached = url && key ? createClient(url, key) : null;
  return cached;
}

/** Test-only: reset the cached client between tests. */
export function _resetSupabase(): void {
  cached = undefined;
}
```

- [ ] **Step 2: Refactor leaderboard to use it**

In `src/leaderboard/client.ts`, replace lines 1-17 (the `createClient` import, `cached`, and the private `getClient`) with:

```ts
import { getSupabase } from '../supabase/client';
import type { PoolKind } from '../state/highscores';
import type { GlobalEntry, SubmitPayload } from './types';

export function isLeaderboardEnabled(): boolean {
  return getSupabase() !== null;
}
```

Then in the same file replace every remaining `getClient()` call with `getSupabase()` (there are three: in `fetchTopScores`, `fetchProjectedRank`, `submitScore`).

- [ ] **Step 3: Run tests and build to verify nothing broke**

Run: `npm test && npm run build`
Expected: PASS (existing leaderboard tests still green; `tsc -b` succeeds).

- [ ] **Step 4: Commit**

```bash
git add src/supabase/client.ts src/leaderboard/client.ts
git commit -m "refactor: extract shared getSupabase() client"
```

---

## Task 2: Database migration (schema + RPC)

**Files:**
- Create: `supabase/migrations/0002_cards.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0002_cards.sql`:

```sql
-- Card catalogue seeded from Scryfall's bulk export. One row per guessable
-- card (`card`) and one per eligible printing/artwork (`card_art`).

create table public.card (
  oracle_id      uuid primary key,
  name           text not null,
  cmc            real,
  colors         text[],
  color_identity text[],
  type_line      text,
  power          text,
  toughness      text,
  edhrec_rank    int,
  is_popular     boolean not null default false,
  is_ub          boolean not null default false
);

create table public.card_art (
  id             bigserial primary key,
  oracle_id      uuid not null references public.card(oracle_id) on delete cascade,
  set_code       text,
  set_name       text,
  rarity         text,
  image_normal   text not null,
  image_art_crop text not null
);

create index card_is_popular_idx on public.card (is_popular);
create index card_art_oracle_idx on public.card_art (oracle_id);

-- Public, read-only access to card data.
alter table public.card enable row level security;
alter table public.card_art enable row level security;
create policy card_read on public.card for select using (true);
create policy card_art_read on public.card_art for select using (true);

-- Seed helper: wipe both tables so the seed script is idempotent. SECURITY
-- DEFINER so the service-role seed can truncate regardless of RLS.
create or replace function public.reset_cards()
returns void
language sql
security definer
set search_path = public
as $$
  truncate public.card_art, public.card restart identity cascade;
$$;

-- Game query: `p_count` random distinct cards (filtered to popular and/or
-- non-UB), each joined to one random artwork. Fresh on every call.
create or replace function public.get_game_cards(
  p_pool text,
  p_count int,
  p_exclude_ub boolean default false
)
returns table (
  oracle_id uuid,
  name text,
  cmc real,
  colors text[],
  color_identity text[],
  type_line text,
  power text,
  toughness text,
  rarity text,
  set_code text,
  set_name text,
  image_normal text,
  image_art_crop text
)
language sql
stable
as $$
  select c.oracle_id, c.name, c.cmc, c.colors, c.color_identity,
         c.type_line, c.power, c.toughness,
         a.rarity, a.set_code, a.set_name, a.image_normal, a.image_art_crop
  from (
    select *
    from public.card
    where (p_pool <> 'popular' or is_popular)
      and (not p_exclude_ub or not is_ub)
    order by random()
    limit greatest(p_count, 0)
  ) c
  cross join lateral (
    select ca.rarity, ca.set_code, ca.set_name, ca.image_normal, ca.image_art_crop
    from public.card_art ca
    where ca.oracle_id = c.oracle_id
    order by random()
    limit 1
  ) a;
$$;

grant execute on function public.get_game_cards(text, int, boolean) to anon, authenticated;
```

- [ ] **Step 2: Apply the migration to Supabase**

Apply via the Supabase MCP `apply_migration` (project `jgapiqpaeaslfpbgiptf`, name `cards`, the SQL above) — or, with the CLI linked, `supabase db push`.

- [ ] **Step 3: Verify the schema exists**

Verify with the Supabase MCP `list_tables` (expect `card` and `card_art`) or run:
`select count(*) from public.card;`
Expected: returns `0` (tables exist, empty).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0002_cards.sql
git commit -m "feat: add card + card_art schema and game-cards RPC"
```

---

## Task 3: Pure seed logic (filter, mapping, popularity)

**Files:**
- Create: `src/cards/seedFilter.ts`
- Test: `src/cards/seedFilter.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/cards/seedFilter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  isEligiblePrinting,
  toCardFields,
  toArtFields,
  topPopularOracleIds,
  type RawCard,
} from './seedFilter';

function base(overrides: Partial<RawCard> = {}): RawCard {
  return {
    oracle_id: 'o1',
    name: 'Lightning Bolt',
    lang: 'en',
    games: ['paper', 'mtgo'],
    layout: 'normal',
    digital: false,
    border_color: 'black',
    full_art: false,
    textless: false,
    frame: '2015',
    frame_effects: [],
    set_type: 'core',
    type_line: 'Instant',
    cmc: 1,
    colors: ['R'],
    color_identity: ['R'],
    power: undefined,
    toughness: undefined,
    rarity: 'common',
    set: 'm10',
    set_name: 'Magic 2010',
    edhrec_rank: 42,
    image_uris: { normal: 'n.jpg', art_crop: 'a.jpg' },
    ...overrides,
  };
}

describe('isEligiblePrinting', () => {
  it('keeps a clean modern English paper printing', () => {
    expect(isEligiblePrinting(base())).toBe(true);
  });
  it('keeps retro frame 2003', () => {
    expect(isEligiblePrinting(base({ frame: '2003' }))).toBe(true);
  });
  it('rejects non-English', () => {
    expect(isEligiblePrinting(base({ lang: 'de' }))).toBe(false);
  });
  it('rejects non-paper', () => {
    expect(isEligiblePrinting(base({ games: ['mtgo', 'arena'] }))).toBe(false);
  });
  it('rejects non-normal layout', () => {
    expect(isEligiblePrinting(base({ layout: 'transform' }))).toBe(false);
  });
  it('rejects digital', () => {
    expect(isEligiblePrinting(base({ digital: true }))).toBe(false);
  });
  it('rejects non-black border', () => {
    expect(isEligiblePrinting(base({ border_color: 'borderless' }))).toBe(false);
  });
  it('rejects full art', () => {
    expect(isEligiblePrinting(base({ full_art: true }))).toBe(false);
  });
  it('rejects textless', () => {
    expect(isEligiblePrinting(base({ textless: true }))).toBe(false);
  });
  it('rejects old frames', () => {
    expect(isEligiblePrinting(base({ frame: '1997' }))).toBe(false);
  });
  it('rejects showcase / extendedart frame effects', () => {
    expect(isEligiblePrinting(base({ frame_effects: ['showcase'] }))).toBe(false);
    expect(isEligiblePrinting(base({ frame_effects: ['extendedart'] }))).toBe(false);
  });
  it('rejects funny and memorabilia sets', () => {
    expect(isEligiblePrinting(base({ set_type: 'funny' }))).toBe(false);
    expect(isEligiblePrinting(base({ set_type: 'memorabilia' }))).toBe(false);
  });
  it('rejects basic lands', () => {
    expect(isEligiblePrinting(base({ type_line: 'Basic Land — Forest' }))).toBe(false);
  });
  it('rejects printings missing an image', () => {
    expect(isEligiblePrinting(base({ image_uris: { art_crop: 'a.jpg' } }))).toBe(false);
    expect(isEligiblePrinting(base({ image_uris: { normal: 'n.jpg' } }))).toBe(false);
  });
});

describe('toCardFields / toArtFields', () => {
  it('extracts oracle-level card fields', () => {
    expect(toCardFields(base())).toEqual({
      oracle_id: 'o1',
      name: 'Lightning Bolt',
      cmc: 1,
      colors: ['R'],
      color_identity: ['R'],
      type_line: 'Instant',
      power: null,
      toughness: null,
      edhrec_rank: 42,
      is_popular: false,
      is_ub: false,
    });
  });
  it('extracts printing-level art fields', () => {
    expect(toArtFields(base())).toEqual({
      oracle_id: 'o1',
      set_code: 'm10',
      set_name: 'Magic 2010',
      rarity: 'common',
      image_normal: 'n.jpg',
      image_art_crop: 'a.jpg',
    });
  });
});

describe('topPopularOracleIds', () => {
  it('returns the n lowest-rank oracle ids, ignoring null ranks', () => {
    const cards = [
      { oracle_id: 'a', edhrec_rank: 100 },
      { oracle_id: 'b', edhrec_rank: 1 },
      { oracle_id: 'c', edhrec_rank: null },
      { oracle_id: 'd', edhrec_rank: 50 },
    ];
    expect(topPopularOracleIds(cards, 2)).toEqual(new Set(['b', 'd']));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/cards/seedFilter.test.ts`
Expected: FAIL — cannot resolve `./seedFilter`.

- [ ] **Step 3: Implement the pure module**

Create `src/cards/seedFilter.ts`:

```ts
// Pure, I/O-free helpers for the card seed script. Operate on raw Scryfall
// bulk-export objects (looser than the app's ScryfallCard).

export interface RawImageUris {
  normal?: string;
  art_crop?: string;
}

export interface RawCard {
  oracle_id?: string;
  name?: string;
  lang?: string;
  games?: string[];
  layout?: string;
  digital?: boolean;
  border_color?: string;
  full_art?: boolean;
  textless?: boolean;
  frame?: string;
  frame_effects?: string[];
  set_type?: string;
  type_line?: string;
  cmc?: number;
  colors?: string[];
  color_identity?: string[];
  power?: string;
  toughness?: string;
  rarity?: string;
  set?: string;
  set_name?: string;
  edhrec_rank?: number | null;
  image_uris?: RawImageUris;
}

const ALLOWED_FRAMES = new Set(['2003', '2015']);
const BLOCKED_FRAME_EFFECTS = new Set(['showcase', 'extendedart']);
const BLOCKED_SET_TYPES = new Set(['funny', 'memorabilia']);

/** True if this printing should be stored as a selectable artwork. */
export function isEligiblePrinting(c: RawCard): boolean {
  if (!c.oracle_id || !c.name) return false;
  if (c.lang !== 'en') return false;
  if (!c.games?.includes('paper')) return false;
  if (c.layout !== 'normal') return false;
  if (c.digital === true) return false;
  if (c.border_color !== 'black') return false;
  if (c.full_art === true) return false;
  if (c.textless === true) return false;
  if (!c.frame || !ALLOWED_FRAMES.has(c.frame)) return false;
  if (c.frame_effects?.some((f) => BLOCKED_FRAME_EFFECTS.has(f))) return false;
  if (c.set_type && BLOCKED_SET_TYPES.has(c.set_type)) return false;
  if (c.type_line?.startsWith('Basic Land')) return false;
  if (!c.image_uris?.normal || !c.image_uris?.art_crop) return false;
  return true;
}

export interface CardFields {
  oracle_id: string;
  name: string;
  cmc: number | null;
  colors: string[] | null;
  color_identity: string[] | null;
  type_line: string | null;
  power: string | null;
  toughness: string | null;
  edhrec_rank: number | null;
  is_popular: boolean;
  is_ub: boolean;
}

/** Oracle-level fields (popularity/UB flags are filled in later). */
export function toCardFields(c: RawCard): CardFields {
  return {
    oracle_id: c.oracle_id!,
    name: c.name!,
    cmc: c.cmc ?? null,
    colors: c.colors ?? null,
    color_identity: c.color_identity ?? null,
    type_line: c.type_line ?? null,
    power: c.power ?? null,
    toughness: c.toughness ?? null,
    edhrec_rank: c.edhrec_rank ?? null,
    is_popular: false,
    is_ub: false,
  };
}

export interface ArtFields {
  oracle_id: string;
  set_code: string | null;
  set_name: string | null;
  rarity: string | null;
  image_normal: string;
  image_art_crop: string;
}

/** Printing-level artwork fields. */
export function toArtFields(c: RawCard): ArtFields {
  return {
    oracle_id: c.oracle_id!,
    set_code: c.set ?? null,
    set_name: c.set_name ?? null,
    rarity: c.rarity ?? null,
    image_normal: c.image_uris!.normal!,
    image_art_crop: c.image_uris!.art_crop!,
  };
}

/** The `n` oracle ids with the lowest edhrec_rank (null ranks excluded). */
export function topPopularOracleIds(
  cards: { oracle_id: string; edhrec_rank: number | null }[],
  n: number,
): Set<string> {
  const ranked = cards
    .filter((c): c is { oracle_id: string; edhrec_rank: number } => c.edhrec_rank != null)
    .sort((a, b) => a.edhrec_rank - b.edhrec_rank)
    .slice(0, n)
    .map((c) => c.oracle_id);
  return new Set(ranked);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/cards/seedFilter.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add src/cards/seedFilter.ts src/cards/seedFilter.test.ts
git commit -m "feat: add pure seed filter + mapping helpers"
```

---

## Task 4: Seed script

**Files:**
- Modify: `package.json` (devDeps + script)
- Modify: `.env.example`
- Create: `scripts/seed-cards.ts`

> `scripts/` is outside `tsconfig.app.json`'s `include` (`["src"]`), so this file is not part of `tsc -b` and won't affect `npm run build`.

- [ ] **Step 1: Add dependencies and the npm script**

Run:
```bash
npm install -D tsx stream-json dotenv
```
Then in `package.json` add to `"scripts"`:
```json
"seed:cards": "tsx scripts/seed-cards.ts"
```

- [ ] **Step 2: Document seed env vars**

Append to `.env.example`:
```
# Seed script only (server-side; never expose the service-role key to the client)
SUPABASE_URL=https://YOUR-PROJECT-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR-SERVICE-ROLE-KEY
ALL_CARDS_PATH=./all-cards.json
```

- [ ] **Step 3: Write the seed script**

Create `scripts/seed-cards.ts`:

```ts
/**
 * Seed the Supabase `card` + `card_art` tables from Scryfall's all-cards.json
 * bulk export. Run locally: `npm run seed:cards`.
 *
 * Requires env (see .env.example): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * ALL_CARDS_PATH (defaults to ./all-cards.json).
 */
import 'dotenv/config';
import { createReadStream } from 'node:fs';
import { parser } from 'stream-json';
import { streamArray } from 'stream-json/streamers/StreamArray';
import { createClient } from '@supabase/supabase-js';
import {
  isEligiblePrinting,
  toCardFields,
  toArtFields,
  topPopularOracleIds,
  type RawCard,
  type CardFields,
  type ArtFields,
} from '../src/cards/seedFilter';

const POPULAR_COUNT = 1000;
const BATCH = 1000;
const SCRYFALL = 'https://api.scryfall.com';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const path = process.env.ALL_CARDS_PATH ?? './all-cards.json';
if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
const db = createClient(url, key, { auth: { persistSession: false } });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fetch every Universes Beyond oracle_id from Scryfall (one-time, dev only). */
async function fetchUbOracleIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  let next: string | null =
    `${SCRYFALL}/cards/search?q=is:ub&unique=cards&page=1`;
  while (next) {
    const res = await fetch(next, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Scryfall is:ub lookup failed: ${res.status}`);
    const json: { data?: { oracle_id?: string }[]; has_more?: boolean; next_page?: string } =
      await res.json();
    for (const c of json.data ?? []) if (c.oracle_id) ids.add(c.oracle_id);
    next = json.has_more ? (json.next_page ?? null) : null;
    await sleep(120); // respect Scryfall's rate limit
  }
  return ids;
}

async function insertBatched<T>(table: string, rows: T[]): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const { error } = await db.from(table).insert(slice);
    if (error) throw new Error(`insert ${table} failed: ${error.message}`);
  }
}

async function main(): Promise<void> {
  console.log('Fetching Universes Beyond oracle ids from Scryfall…');
  const ubIds = await fetchUbOracleIds();
  console.log(`  ${ubIds.size} UB oracle ids`);

  const cards = new Map<string, CardFields>();
  const arts: ArtFields[] = [];

  console.log(`Streaming ${path}…`);
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path).pipe(parser()).pipe(streamArray());
    stream.on('data', ({ value }: { value: RawCard }) => {
      if (!isEligiblePrinting(value)) return;
      const oid = value.oracle_id!;
      if (!cards.has(oid)) cards.set(oid, toCardFields(value));
      arts.push(toArtFields(value));
    });
    stream.on('end', () => resolve());
    stream.on('error', reject);
  });

  const cardList = [...cards.values()];
  const popular = topPopularOracleIds(cardList, POPULAR_COUNT);
  for (const c of cardList) {
    c.is_popular = popular.has(c.oracle_id);
    c.is_ub = ubIds.has(c.oracle_id);
  }

  console.log(
    `Eligible: ${cardList.length} cards, ${arts.length} arts, ` +
      `${popular.size} popular, ${cardList.filter((c) => c.is_ub).length} UB`,
  );

  console.log('Resetting tables…');
  const reset = await db.rpc('reset_cards');
  if (reset.error) throw new Error(`reset_cards failed: ${reset.error.message}`);

  console.log('Inserting cards…');
  await insertBatched('card', cardList);
  console.log('Inserting arts…');
  await insertBatched('card_art', arts);

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 4: Run the seed against Supabase**

Create a local `.env` (gitignored) with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `ALL_CARDS_PATH=./all-cards.json`, then run:
`npm run seed:cards`
Expected: logs UB count, eligible counts (cards/arts/popular/UB), then "Done." No errors.

- [ ] **Step 5: Verify row counts in Supabase**

Run (via Supabase MCP `execute_sql` or SQL editor):
```sql
select
  (select count(*) from public.card) as cards,
  (select count(*) from public.card_art) as arts,
  (select count(*) from public.card where is_popular) as popular,
  (select count(*) from public.card where is_ub) as ub;
```
Expected: `popular = 1000`; `cards` and `arts` are non-zero with `arts >= cards`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .env.example scripts/seed-cards.ts
git commit -m "feat: add card seed script over Scryfall bulk export"
```

---

## Task 5: Cards client (RPC reader)

**Files:**
- Create: `src/cards/client.ts`
- Test: `src/cards/client.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/cards/client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('../supabase/client', () => ({
  getSupabase: () => ({ rpc }),
}));

import { rowToCard, fetchCandidates, fetchRandomCard, type GameCardRow } from './client';

function row(overrides: Partial<GameCardRow> = {}): GameCardRow {
  return {
    oracle_id: 'o1',
    name: 'Lightning Bolt',
    cmc: 1,
    colors: ['R'],
    color_identity: ['R'],
    type_line: 'Instant',
    power: null,
    toughness: null,
    rarity: 'common',
    set_code: 'm10',
    set_name: 'Magic 2010',
    image_normal: 'n.jpg',
    image_art_crop: 'a.jpg',
    ...overrides,
  };
}

beforeEach(() => rpc.mockReset());

describe('rowToCard', () => {
  it('maps an RPC row onto the ScryfallCard shape', () => {
    expect(rowToCard(row())).toEqual({
      id: 'o1',
      name: 'Lightning Bolt',
      cmc: 1,
      colors: ['R'],
      color_identity: ['R'],
      type_line: 'Instant',
      power: undefined,
      toughness: undefined,
      rarity: 'common',
      set: 'm10',
      set_name: 'Magic 2010',
      image_uris: { normal: 'n.jpg', art_crop: 'a.jpg' },
    });
  });
});

describe('fetchCandidates', () => {
  it('calls get_game_cards with pool/exclude_ub and maps rows', async () => {
    rpc.mockResolvedValue({ data: [row(), row({ oracle_id: 'o2', name: 'Counterspell' })], error: null });
    const cards = await fetchCandidates({ kind: 'popular', excludeUniverseBeyond: true });
    expect(rpc).toHaveBeenCalledWith('get_game_cards', {
      p_pool: 'popular',
      p_count: 175,
      p_exclude_ub: true,
    });
    expect(cards.map((c) => c.name)).toEqual(['Lightning Bolt', 'Counterspell']);
  });

  it('forwards a custom limit as p_count', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await fetchCandidates({ kind: 'all', excludeUniverseBeyond: false }, 40);
    expect(rpc).toHaveBeenCalledWith('get_game_cards', {
      p_pool: 'all',
      p_count: 40,
      p_exclude_ub: false,
    });
  });

  it('throws on an RPC error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(fetchCandidates({ kind: 'all', excludeUniverseBeyond: false })).rejects.toThrow('boom');
  });
});

describe('fetchRandomCard', () => {
  it('returns the single card from a count-1 all query', async () => {
    rpc.mockResolvedValue({ data: [row()], error: null });
    const card = await fetchRandomCard();
    expect(rpc).toHaveBeenCalledWith('get_game_cards', {
      p_pool: 'all',
      p_count: 1,
      p_exclude_ub: false,
    });
    expect(card.image_uris?.art_crop).toBe('a.jpg');
  });

  it('throws when no card comes back', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await expect(fetchRandomCard()).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/cards/client.test.ts`
Expected: FAIL — cannot resolve `./client`.

- [ ] **Step 3: Implement the client**

Create `src/cards/client.ts`:

```ts
import { getSupabase } from '../supabase/client';
import type { ScryfallCard, PoolSelection, Color } from '../scryfall/types';

// Matches one row returned by the get_game_cards RPC.
export interface GameCardRow {
  oracle_id: string;
  name: string;
  cmc: number | null;
  colors: string[] | null;
  color_identity: string[] | null;
  type_line: string | null;
  power: string | null;
  toughness: string | null;
  rarity: string | null;
  set_code: string | null;
  set_name: string | null;
  image_normal: string;
  image_art_crop: string;
}

// A full search page's worth of cards, so pre-planned rounds never repeat.
const DEFAULT_LIMIT = 175;

/** Map an RPC row onto the app's internal ScryfallCard shape. */
export function rowToCard(r: GameCardRow): ScryfallCard {
  return {
    id: r.oracle_id,
    name: r.name,
    cmc: r.cmc ?? 0,
    colors: (r.colors ?? undefined) as Color[] | undefined,
    color_identity: (r.color_identity ?? undefined) as Color[] | undefined,
    type_line: r.type_line ?? '',
    power: r.power ?? undefined,
    toughness: r.toughness ?? undefined,
    rarity: r.rarity ?? undefined,
    set: r.set_code ?? undefined,
    set_name: r.set_name ?? undefined,
    image_uris: { normal: r.image_normal, art_crop: r.image_art_crop },
  };
}

async function queryGameCards(
  pool: 'popular' | 'all',
  count: number,
  excludeUb: boolean,
): Promise<ScryfallCard[]> {
  const c = getSupabase();
  if (!c) throw new Error('Card database is not configured.');
  const { data, error } = await c.rpc('get_game_cards', {
    p_pool: pool,
    p_count: count,
    p_exclude_ub: excludeUb,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as GameCardRow[]).map(rowToCard);
}

/** Random distinct cards for one game, each with a random artwork. */
export function fetchCandidates(
  input: PoolSelection,
  limit = DEFAULT_LIMIT,
): Promise<ScryfallCard[]> {
  return queryGameCards(input.kind, limit, input.excludeUniverseBeyond);
}

/** One random card — used for the start-screen splash artwork. */
export async function fetchRandomCard(): Promise<ScryfallCard> {
  const cards = await queryGameCards('all', 1, false);
  if (cards.length === 0) throw new Error('No card returned.');
  return cards[0];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/cards/client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cards/client.ts src/cards/client.test.ts
git commit -m "feat: add Supabase-backed cards client"
```

---

## Task 6: Wire the app to the new client and remove Scryfall

**Files:**
- Modify: `src/state/gameStore.ts:5`
- Modify: `src/App.tsx:4`
- Delete: `src/scryfall/client.ts`, `src/scryfall/client.test.ts`

- [ ] **Step 1: Repoint gameStore import**

In `src/state/gameStore.ts` line 5, change:
```ts
import { fetchCandidates } from '../scryfall/client';
```
to:
```ts
import { fetchCandidates } from '../cards/client';
```
(The `fetchCandidates(selection)` call on line 107 is unchanged — same signature.)

- [ ] **Step 2: Repoint App import**

In `src/App.tsx` line 4, change:
```ts
import { fetchRandomCard } from './scryfall/client';
```
to:
```ts
import { fetchRandomCard } from './cards/client';
```
(The `fetchRandomCard()` call on line 29 is unchanged — same signature, returns a `ScryfallCard` with `image_uris.art_crop`.)

- [ ] **Step 3: Delete the Scryfall client and its test**

Run:
```bash
git rm src/scryfall/client.ts src/scryfall/client.test.ts
```
(`src/scryfall/types.ts` stays — it defines `ScryfallCard`, `PoolSelection`, `Color`.)

- [ ] **Step 4: Verify nothing else imports the deleted module**

Run: `grep -rn "scryfall/client" src/`
Expected: no output.

- [ ] **Step 5: Run full test suite and build**

Run: `npm test && npm run build`
Expected: PASS — no references to the removed fetcher, `tsc -b` clean, all tests green.

- [ ] **Step 6: Commit**

```bash
git add src/state/gameStore.ts src/App.tsx
git commit -m "feat: read cards from Supabase, drop Scryfall API client"
```

---

## Task 7: End-to-end verification in the browser

**Files:** none (verification only)

- [ ] **Step 1: Ensure the app env points at the seeded project**

Confirm `.env` (or `.env.local`) has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for project `jgapiqpaeaslfpbgiptf`.

- [ ] **Step 2: Start the dev server**

Run: `npm run dev`
Expected: serves on a local URL with no console errors.

- [ ] **Step 3: Verify a real game loads from Supabase**

In the browser (use the preview/inspect tools — eyeball actual pixels, don't trust mocks):
- Start screen splash artwork renders (proves `fetchRandomCard` → RPC works).
- Start a **Popular** game: card image and four name options render; play a round.
- Start an **All Cards** game: cards load and render.
- Restart a game and confirm a **different** set of cards / artwork appears (proves #6 fresh cards + #5 artwork cycling).
- Toggle "Exclude Universes Beyond" and confirm a game still loads (proves the `p_exclude_ub` path).

Expected: all pass; no Scryfall network calls in the Network tab (only Supabase + Scryfall CDN image hosts).

- [ ] **Step 4: Final commit if any tweaks were needed**

Only if Step 3 surfaced fixes; otherwise nothing to commit.

---

## Self-review notes

- **Spec coverage:** schema + RLS (§Data model → Task 2); seed script with full filter list (§Seed → Tasks 3-4); RPC read path mapping to `ScryfallCard` (§App read path → Tasks 2,5,6); #2 popular=1000 (`topPopularOracleIds`, `is_popular` filter); #5 artwork cycling (random `card_art` in RPC); #6 fresh cards (no caching, `random()` per call). UB toggle preserved via `is_ub` + one-time Scryfall lookup (discovered during planning, confirmed with user).
- **Out of scope (other sub-projects):** #1/#3 UI, #4 leaderboard windows — not in this plan.
- **Type consistency:** `RawCard`/`CardFields`/`ArtFields` defined in Task 3 are imported by Task 4; `GameCardRow` defined in Task 5 matches the RPC `returns table(...)` columns in Task 2; `fetchCandidates`/`fetchRandomCard` keep the exact signatures the call sites in Task 6 already use.
