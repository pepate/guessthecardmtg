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
