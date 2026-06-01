-- Daily Set: one shared, never-before-played set per Berlin day, with a fixed
-- random reveal. Created lazily by the daily-set edge function (service role).
create table if not exists public.daily_set (
  day        date primary key,
  mode_id    uuid not null references public.mode(id),
  reveal     text not null,
  created_at timestamptz not null default now()
);
alter table public.daily_set enable row level security;
drop policy if exists daily_set_public_read on public.daily_set;
create policy daily_set_public_read on public.daily_set for select using (true);
grant select on public.daily_set to anon, authenticated;
