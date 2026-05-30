-- Sets area: per-set eligible-card count (for the >=50 playable gate) and a
-- single RPC that lists every qualifying set with its set-mode leaderboard stats.

-- 1. Eligible card count per set (distinct cards available in that set's printings).
alter table public.card_set add column if not exists eligible_count int not null default 0;

create or replace function public.backfill_set_eligible_count()
returns void language sql as $$
  update public.card_set s set eligible_count = coalesce(sub.n, 0)
  from (select set_code, count(distinct oracle_id) n from public.card_art group by set_code) sub
  where sub.set_code = s.code;
$$;
grant execute on function public.backfill_set_eligible_count() to service_role;

-- 2. set_list: every set with >=50 eligible cards, joined to its set-kind mode
-- (filter = {"sets":[code]}) and that mode's leaderboard stats. Stats are null
-- when the set has never been played (no mode / no entries).
create or replace function public.set_list()
returns table (
  code text, name text, released_at date, eligible_count int,
  mode_id uuid, champion_name text, champion_score int,
  entry_count bigint, last_activity timestamptz
) language sql stable as $$
  select s.code, s.name, s.released_at, s.eligible_count,
         m.id as mode_id,
         champ.name as champion_name, champ.score as champion_score,
         coalesce(stats.entry_count, 0) as entry_count,
         stats.last_activity
  from public.card_set s
  left join public.mode m
    on m.kind = 'set' and m.filter = jsonb_build_object('sets', jsonb_build_array(s.code))
  left join lateral (
    select count(*) as entry_count, max(l.created_at) as last_activity
    from public.leaderboard l where l.mode_id = m.id
  ) stats on true
  left join lateral (
    select l.name, l.score from public.leaderboard l
    where l.mode_id = m.id
    order by l.score desc, l.created_at asc limit 1
  ) champ on true
  where s.eligible_count >= 50
  order by s.released_at desc nulls last;
$$;
grant execute on function public.set_list() to anon, authenticated;
