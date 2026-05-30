# Card-Data Backend — Design

**Date:** 2026-05-30
**Status:** Approved (design); pending implementation plan
**Sub-project:** A of 3 (see "Scope & decomposition")

## Problem

The game currently fetches cards live from the Scryfall API on every game start
(`src/scryfall/client.ts`). Now that the project has a Supabase backend, we want
to own the card data: seed a filtered subset of Scryfall's bulk export into
Supabase and have the app read cards from there instead of calling Scryfall.

This change is also the natural home for three pieces of tester feedback:

- **#2** The "popular" pool is too small — make it ~5× bigger.
- **#5** Cards have multiple artworks — cycle through them (but never show
  full-art / showcase / special treatments).
- **#6** Every restart must load new cards (no caching), even if slightly slower.

## Scope & decomposition

The full request was decomposed into three independent sub-projects, each with
its own design → plan → implementation cycle:

- **A. Card-data backend (this spec):** seed script, Supabase schema, app reads
  from Supabase. Covers #2, #5, #6.
- **B. Gameplay / responsive UI (later):** #3 side-by-side answer layout on
  desktop & landscape; #1 answer-position memorization. (Note: option positions
  are already reshuffled with `Math.random()` each round in `timeAttack.ts`; the
  real driver of "it gets too easy" is the small recurring pool, which A fixes.)
- **C. Leaderboard time windows (later):** #4 Today / Weekly / All-time sub-tabs.

This spec covers **A only**.

## Decisions (confirmed with user)

- **Images:** hotlink Scryfall's CDN URLs (store URLs only, no image binaries in
  Supabase Storage). "No longer working with Scryfall" means no more API calls;
  images still load from Scryfall's CDN, which Scryfall explicitly permits.
- **Artwork breadth:** keep modern + retro frames (`frame` ∈ {`2003`, `2015`}),
  black-border, normal-art printings only. Excludes all special treatments.
- **Popular pool:** top **1,000** cards by EDHREC rank (`edhrec_rank` ascending;
  lower = more popular).
- **Exclusions:** drop basic lands; drop tokens / emblems / art-series and other
  non-`normal` layouts; **single-faced cards only** (no double-faced cards).
- **Schema:** normalized — `card` (one row per guessable card) + `card_art`
  (one row per eligible printing). Chosen over a denormalized single table or a
  JSONB-blob model for query simplicity and clean mapping onto existing code.

## Data model (migration `supabase/migrations/0002_cards.sql`)

```sql
create table public.card (
  oracle_id      uuid primary key,   -- stable guessable identity
  name           text not null,
  cmc            real,
  colors         text[],
  color_identity text[],
  type_line      text,
  power          text,               -- nullable
  toughness      text,               -- nullable
  edhrec_rank    int,                -- nullable; lower = more popular
  is_popular     boolean not null default false
);

create table public.card_art (
  id             bigserial primary key,
  oracle_id      uuid not null references public.card(oracle_id) on delete cascade,
  set_code       text,
  set_name       text,
  rarity         text,               -- printing-level; drives card glow in UI
  image_normal   text not null,      -- Scryfall CDN URL
  image_art_crop text not null       -- Scryfall CDN URL
);

create index card_is_popular_idx on public.card (is_popular);
create index card_art_oracle_idx on public.card_art (oracle_id);
```

- **RLS:** enabled on both tables with a public read-only `SELECT` policy (card
  data is public). Writes happen only via the seed script's service-role key.

## Seed script (`scripts/seed-cards.ts`, run locally)

- Run with `tsx`/Node. Requires `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
  from the environment (never committed; `.env`-style file is gitignored).
- **Streams** `all-cards.json` (2.4 GB — cannot `JSON.parse`; use a streaming
  JSON-array parser, e.g. `stream-json`).
- **Keep a printing only if all hold:**
  - `lang === 'en'`
  - `games` includes `'paper'`
  - `layout === 'normal'` (drops tokens, emblems, art-series, split, DFC, etc.)
  - not digital (`digital === false`)
  - `border_color === 'black'`
  - `full_art === false`
  - `textless !== true`
  - `frame` ∈ {`'2003'`, `'2015'`}
  - no `showcase` / `extendedart` entries in `frame_effects`
  - `set_type` not in {`funny`, `memorabilia`}
  - not a Basic Land (`type_line` does not start with `Basic Land`)
  - has both `image_uris.normal` and `image_uris.art_crop`
- **Group by `oracle_id`:** one `card` row (oracle-level fields + `edhrec_rank`,
  taken from the card object) plus N `card_art` rows.
- **Popularity:** rank cards by `edhrec_rank` ascending; the top 1,000 get
  `is_popular = true` (cards with null `edhrec_rank` are never popular).
- **Idempotent:** truncate-then-insert, batched (~1,000 rows/request) via the
  service-role client. Prints final counts (cards, arts, popular).

## App read path (replaces Scryfall API)

- **RPC** `get_game_cards(p_pool text, p_count int)` (in the migration):
  selects `p_count` random distinct `card` rows (filtered to `is_popular` when
  `p_pool = 'popular'`), each joined via lateral sub-select to **one random**
  `card_art`. Returns rows shaped like the current card object.
- New loader in `src/cards/` calls the RPC via the existing Supabase client and
  maps each row to the **existing `ScryfallCard` type**, so `planGame`,
  `gameStore`, and all UI remain unchanged.
- `src/scryfall/client.ts`'s live fetch / retry / rate-limit code is removed
  (the `ScryfallCard` type is retained as the internal card shape). Images still
  hotlink Scryfall's CDN via the stored URLs.
- **#6 fresh cards each restart:** the RPC uses `random()` per call with no
  caching, so every game and every restart pulls a new set of cards — and
  **#5** a new random artwork per card.

## What this delivers

- **#2** popular pool = top 1,000 (5×) via `is_popular`.
- **#5** artwork cycles across games (random `card_art` per card per game).
- **#6** new cards on every restart (no caching).

## Out of scope (later sub-projects)

- **#1 / #3** answer-option UI and responsive layout (sub-project B).
- **#4** leaderboard Today / Weekly / All-time windows (sub-project C).

## Risks / open notes

- **Seed size:** number of surviving printings is unknown until the script runs;
  expected to fit comfortably in the Supabase free-tier DB (URLs + a few columns
  per row). Confirm counts after the first run.
- **`ORDER BY random()`** on the `card` table (tens of thousands of rows) is
  acceptable for a once-per-game query; revisit only if it proves slow.
- **EDHREC coverage:** cards without an `edhrec_rank` exist only in the "all"
  pool, never "popular".
