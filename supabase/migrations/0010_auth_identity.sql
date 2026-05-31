-- Phase 1 of the auth identity work. Introduces a real per-player identity
-- (auth.uid()) and lifetime game counters, reusing the existing
-- leaderboard.device_id column to carry the uid for new rows.

-- 1. Player profile: one row per authenticated (incl. anonymous) user.
--    display_name is the single source of truth for the shown name; counters
--    accumulate over the player's lifetime (no per-game timestamps — by design).
create table if not exists public.profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 3 and 16),
  games_played  int  not null default 0,
  total_correct int  not null default 0,
  total_cards   int  not null default 0,
  created_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- A user may read and write ONLY their own profile (Phase 2 rename happens
-- client-side through this policy; the public board name is exposed via the
-- owner-run view below, not this table).
drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2. Atomic upsert+increment. SECURITY DEFINER so the Edge Function (service
--    role) calls it directly; increments cannot be expressed via the JS client's
--    .update(), hence an RPC. Called once per posted game.
create or replace function public.bump_profile_stats(
  p_user    uuid,
  p_name    text,
  p_correct int,
  p_cards   int
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.profiles (user_id, display_name, games_played, total_correct, total_cards)
  values (p_user, p_name, 1, greatest(p_correct, 0), greatest(p_cards, 0))
  on conflict (user_id) do update set
    display_name  = excluded.display_name,
    games_played  = public.profiles.games_played  + 1,
    total_correct = public.profiles.total_correct + excluded.total_correct,
    total_cards   = public.profiles.total_cards   + excluded.total_cards;
$$;

-- 3. Recreate the public board view so the displayed name follows the profile
--    (a Phase-2 rename reflects everywhere immediately). New rows carry the uid
--    in device_id; legacy rows carry an old localStorage id that matches no
--    profile, so coalesce falls back to their frozen leaderboard.name.
drop view if exists public.leaderboard_top;
create view public.leaderboard_top as
  select
    l.id,
    coalesce(p.display_name, l.name) as name,
    l.score, l.correct, l.mode_id, l.game_mode, l.device_id, l.country, l.created_at
  from public.leaderboard l
  left join public.profiles p on p.user_id::text = l.device_id;
grant select on public.leaderboard_top to anon, authenticated;
