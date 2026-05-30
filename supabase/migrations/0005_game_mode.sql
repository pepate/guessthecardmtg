-- Tag each score with the reveal mode it was played in (orthogonal to pool/mode_id).
alter table public.leaderboard add column if not exists game_mode text;

create index if not exists leaderboard_gamemode_score_idx
  on public.leaderboard (game_mode, score desc, created_at);

-- The public read view (public.leaderboard_top) is created in 0007_merge_reconcile.sql.
