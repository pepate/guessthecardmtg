-- Fix set_list(): migration 0013 dropped leaderboard.name (the displayed name now
-- lives on profiles.display_name, joined via leaderboard.device_id = profiles.user_id),
-- but set_list() still selected l.name directly from leaderboard, so the RPC failed
-- with "column l.name does not exist" and the Build-a-mode set picker loaded no sets.
-- Source the champion name from the profile instead. (score/created_at are unchanged.)
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
    select p.display_name as name, l.score
    from public.leaderboard l
    join public.profiles p on p.user_id = l.device_id
    where l.mode_id = m.id
    order by l.score desc, l.created_at asc limit 1
  ) champ on true
  where s.eligible_count >= 50
  order by s.released_at desc nulls last;
$$;
grant execute on function public.set_list() to anon, authenticated;
