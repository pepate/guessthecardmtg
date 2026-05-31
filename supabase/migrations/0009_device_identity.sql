-- Re-key the leaderboard around an anonymous device_id and seed starter modes.

-- 1. device_id column. Backfill legacy rows so no historical score is lost.
alter table public.leaderboard add column if not exists device_id text;
update public.leaderboard set device_id = 'legacy:' || name where device_id is null;
alter table public.leaderboard alter column device_id set not null;

-- 2. Collapse any pre-existing duplicates to the single best run per
--    (mode_id, game_mode, device_id) before enforcing the new uniqueness.
--    "Best" = highest score, then newest, then larger id.
delete from public.leaderboard a
using public.leaderboard b
where a.mode_id = b.mode_id
  and coalesce(a.game_mode, '') = coalesce(b.game_mode, '')
  and a.device_id = b.device_id
  and (
    b.score > a.score
    or (b.score = a.score and b.created_at > a.created_at)
    or (b.score = a.score and b.created_at = a.created_at and b.id > a.id)
  );

-- 3. Swap the dedup uniqueness from name-based (0008) to device-based.
drop index if exists public.leaderboard_person_mode_uniq;
create unique index if not exists leaderboard_device_mode_uniq
  on public.leaderboard (mode_id, coalesce(game_mode, ''), device_id);

-- 4. Recreate the public read view to expose device_id (needed for standing
--    and rank-1 lockout). mode_id-keyed, no pool.
drop view if exists public.leaderboard_top;
create view public.leaderboard_top as
  select id, name, score, correct, mode_id, game_mode, device_id, country, created_at
  from public.leaderboard;
grant select on public.leaderboard_top to anon;

-- 5. Seed three starter modes. Idempotent on filter_hash. card_count computed from
--    the live card pool. filter_hash = SHA-256 of the canonical filter JSON produced
--    by src/modes/filter.ts canonicalizeFilter, so a user later building the same
--    filter dedupes onto the seed.
insert into public.mode (name, filter, filter_hash, card_count, kind, slug)
values
  ('Top 100 EDHRec',  '{"edhrec":{"max":100}}'::jsonb,
     'cab38d25b4697d3fe7eb6ee8e9949b5c8601f1155781be37d814149785deca14',
     public.count_filtered_cards('{"edhrec":{"max":100}}'::jsonb),  'custom', 'seed-top100-edhrec'),
  ('Top 1000 EDHRec', '{"edhrec":{"max":1000}}'::jsonb,
     '234d86301fe94b61ae4241af7e7f7231dbc0b6c63db82071dd656a16a85a2b08',
     public.count_filtered_cards('{"edhrec":{"max":1000}}'::jsonb), 'custom', 'seed-top1000-edhrec'),
  ('Simic',           '{"colors":{"match":"all","values":["G","U"]}}'::jsonb,
     '9b1a5bda2de3a7fc0d207a0e74856266c7a88d4efe8a0e396aa31029db3fdf06',
     public.count_filtered_cards('{"colors":{"match":"all","values":["G","U"]}}'::jsonb), 'custom', 'seed-simic')
on conflict (filter_hash) do nothing;
