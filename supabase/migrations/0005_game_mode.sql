-- Tag each score with the reveal mode it was played in (orthogonal to pool/mode_id).
alter table public.leaderboard add column if not exists game_mode text;

create index if not exists leaderboard_gamemode_score_idx
  on public.leaderboard (game_mode, score desc, created_at);

-- Re-create the public read view so it also exposes game_mode (mirrors 0003's column
-- set + game_mode).
drop view if exists public.leaderboard_top;
create view public.leaderboard_top as
  select id, name, score, correct, pool, mode_id, game_mode, country, created_at
  from public.leaderboard;
grant select on public.leaderboard_top to anon;
