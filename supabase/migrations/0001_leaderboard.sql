-- Global leaderboard. The base table is locked down with RLS (no anon policies),
-- so anonymous clients cannot read or write it directly. Reads go through the
-- leaderboard_top VIEW, which is owned by postgres (the table owner) and therefore
-- bypasses the base table's RLS; we grant SELECT on the view to anon. Writes go
-- exclusively through the submit-score Edge Function using the service role.

create table if not exists public.leaderboard (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 16),
  score int not null check (score >= 0),
  correct int not null check (correct between 0 and 40),
  pool text not null check (pool in ('popular', 'all')),
  country text check (country ~ '^[A-Z]{2}$'),
  ip_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists leaderboard_pool_score_idx
  on public.leaderboard (pool, score desc, created_at asc);

create index if not exists leaderboard_ratelimit_idx
  on public.leaderboard (ip_hash, created_at desc);

alter table public.leaderboard enable row level security;
-- Intentionally NO policies: anon/authenticated cannot select/insert directly.

-- Public, read-only projection without ip_hash. NOT security_invoker, so it runs
-- as its owner (postgres = table owner) and bypasses RLS for reads.
create or replace view public.leaderboard_top as
  select id, name, score, correct, pool, country, created_at
  from public.leaderboard;

grant select on public.leaderboard_top to anon;
