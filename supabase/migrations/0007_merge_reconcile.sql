-- Reconcile the live schema after merging the game-mode/reveal-modes work into the
-- mode_id leaderboard rework. The mode_id restructure (0005_mode_foundation) already
-- dropped `pool`; this brings in the two main-branch additions on top of it:
--   * reveal_mode toggles table (from 0004_reveal_modes)
--   * leaderboard.game_mode tag (from 0005_game_mode) — but the recreated
--     leaderboard_top view exposes game_mode WITHOUT the removed `pool` column.

-- 1. Reveal-mode toggles (idempotent).
create table if not exists public.reveal_mode (
  key         text primary key,
  enabled     boolean not null default true,
  sort_order  int not null default 0,
  label       text
);
alter table public.reveal_mode enable row level security;
drop policy if exists "reveal_mode public read" on public.reveal_mode;
create policy "reveal_mode public read" on public.reveal_mode
  for select to anon using (true);
insert into public.reveal_mode (key, enabled, sort_order, label) values
  ('blur',       true, 0, 'Blur'),
  ('scanner',    true, 1, 'Scanner'),
  ('mosaic',     true, 2, 'Mosaic'),
  ('zoom',       true, 3, 'Zoom'),
  ('silhouette', true, 4, 'Silhouette'),
  ('spotlight',  true, 5, 'Spotlight')
on conflict (key) do nothing;

-- 2. game_mode tag on scores + index.
alter table public.leaderboard add column if not exists game_mode text;
create index if not exists leaderboard_gamemode_score_idx
  on public.leaderboard (game_mode, score desc, created_at);

-- 3. Recreate the public read view to expose game_mode (mode_id-keyed; no pool).
drop view if exists public.leaderboard_top;
create view public.leaderboard_top as
  select id, name, score, correct, mode_id, game_mode, country, created_at
  from public.leaderboard;
grant select on public.leaderboard_top to anon;
