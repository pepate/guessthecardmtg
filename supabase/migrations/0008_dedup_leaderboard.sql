-- Dedup the leaderboard so a name appears once per reveal mode in each mode.
-- The public board collapses these further to one row per person (their best score)
-- and renders each reveal mode as a badge; keeping one best row per
-- (mode_id, game_mode, name) gives those badges their data without storing the same
-- name twice for the same reveal mode.

-- 1. Collapse existing duplicates to the single best run per (mode_id, game_mode, name).
--    "Best" = highest score, breaking ties toward the newest run, then the larger id.
delete from public.leaderboard a
using public.leaderboard b
where a.mode_id = b.mode_id
  and coalesce(a.game_mode, '') = coalesce(b.game_mode, '')
  and a.name = b.name
  and (
    b.score > a.score
    or (b.score = a.score and b.created_at > a.created_at)
    or (b.score = a.score and b.created_at = a.created_at and b.id > a.id)
  );

-- 2. Enforce it going forward. coalesce keeps NULL game_mode rows from slipping past
--    the constraint (Postgres treats NULLs as distinct in a plain unique index).
create unique index if not exists leaderboard_person_mode_uniq
  on public.leaderboard (mode_id, coalesce(game_mode, ''), name);
