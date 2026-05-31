-- Display names must be globally unique (case-insensitive): two anonymous
-- players sharing a name look like one account on the board. The existing rows
-- were test accounts, so we wipe leaderboard + profiles for a clean start, then
-- add a hard constraint and enforce it on every name write.

truncate table public.leaderboard;
delete from public.profiles;

-- Case-insensitive uniqueness on the display name.
create unique index if not exists profiles_display_name_lower_key
  on public.profiles (lower(display_name));

-- Availability check for the client: RLS (profiles_self) hides other users'
-- rows, so a SECURITY DEFINER function is needed to look across all profiles.
-- Excludes the caller's own row so a user can re-save their current name.
create or replace function public.name_available(p_name text) returns boolean
language sql security definer set search_path = public stable
as $$
  select not exists (
    select 1 from public.profiles
    where lower(display_name) = lower(btrim(p_name))
      and user_id is distinct from auth.uid()
  );
$$;
grant execute on function public.name_available(text) to anon, authenticated;

-- bump_profile_stats now refuses a name already owned by another user, raising a
-- unique_violation the Edge Function turns into a 'name-taken' rejection.
create or replace function public.bump_profile_stats(
  p_user    uuid,
  p_name    text,
  p_correct int,
  p_cards   int
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

  insert into public.profiles (user_id, display_name, games_played, total_correct, total_cards)
  values (p_user, p_name, 1, greatest(p_correct, 0), greatest(p_cards, 0))
  on conflict (user_id) do update set
    display_name  = excluded.display_name,
    games_played  = public.profiles.games_played  + 1,
    total_correct = public.profiles.total_correct + excluded.total_correct,
    total_cards   = public.profiles.total_cards   + excluded.total_cards;
end;
$$;
