-- Identity lives on the profile, not on each leaderboard row. Move the home
-- country to profiles, make a leaderboard row a pure reference to the player's
-- profile (drop the duplicated name/country and the per-row ip_hash), and source
-- the displayed name + country from the profile via the public view — so a
-- rename or country change reflects everywhere instantly.

-- 1. Home country on the profile (set on first submit, editable in the profile).
alter table public.profiles add column if not exists country text
  check (country is null or country ~ '^[A-Z]{2}$');

-- 2. Remove orphan rows (device_id with no matching profile) so the FK can be
--    added. One such row exists from a duplicate anonymous account whose profile
--    was removed during earlier uniqueness testing.
delete from public.leaderboard l
  where not exists (select 1 from public.profiles p where p.user_id::text = l.device_id);

-- 3. The view depends on leaderboard.name/country — drop it before the columns.
drop view if exists public.leaderboard_top;

-- 4. device_id becomes a real uuid FK to the profile.
alter table public.leaderboard alter column device_id type uuid using device_id::uuid;
alter table public.leaderboard
  add constraint leaderboard_device_profile_fkey
  foreign key (device_id) references public.profiles(user_id) on delete cascade;

-- 5. Drop the now-duplicated / no-longer-stored identity columns.
alter table public.leaderboard drop column if exists name;
alter table public.leaderboard drop column if exists country;
alter table public.leaderboard drop column if exists ip_hash;

-- 6. Public board view: name + country come straight from the profile. INNER
--    join is safe now that every row has a profile (FK guarantees it).
create view public.leaderboard_top as
  select
    l.id,
    p.display_name as name,
    l.score, l.correct, l.mode_id, l.game_mode, l.device_id,
    p.country,
    l.created_at
  from public.leaderboard l
  join public.profiles p on p.user_id = l.device_id;
grant select on public.leaderboard_top to anon, authenticated;

-- 7. bump_profile_stats also seeds the country on first creation (only on insert,
--    so a later manual choice in the profile is preserved). Still refuses a name
--    owned by another user.
create or replace function public.bump_profile_stats(
  p_user    uuid,
  p_name    text,
  p_correct int,
  p_cards   int,
  p_country text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.profiles
    where lower(display_name) = lower(p_name) and user_id <> p_user
  ) then
    raise exception 'display_name_taken' using errcode = 'unique_violation';
  end if;

  insert into public.profiles (user_id, display_name, games_played, total_correct, total_cards, country)
  values (
    p_user, p_name, 1, greatest(p_correct, 0), greatest(p_cards, 0),
    case when p_country ~ '^[A-Z]{2}$' then p_country else null end
  )
  on conflict (user_id) do update set
    display_name  = excluded.display_name,
    games_played  = public.profiles.games_played  + 1,
    total_correct = public.profiles.total_correct + excluded.total_correct,
    total_cards   = public.profiles.total_cards   + excluded.total_cards;
  -- country deliberately left untouched on conflict (preserve the player's choice).
end;
$$;
